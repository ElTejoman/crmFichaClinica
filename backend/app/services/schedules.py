"""Casos de uso de configuración de agenda: horarios, excepciones, salas y tipos de cita.

Todo cambio de configuración se audita. Las excepciones (vacaciones/feriados) NO cancelan las
citas existentes: devuelven cuántas quedan afectadas para que recepción las reprograme.
"""

import uuid
from datetime import date, time, timedelta

from app.core.errors import (
    BusinessRuleError,
    ConflictError,
    NotFoundError,
)
from app.domain.agenda_rules import (
    AgendaRuleError,
    WorkingBlock,
    at_clinic_time,
    blocks_overlap,
    validate_block,
)
from app.domain.enums import AuditAction, Role
from app.models.agenda import AppointmentType, DoctorSchedule, Room, ScheduleException
from app.models.user import User
from app.repositories.agenda_catalog import AppointmentTypeRepository, RoomRepository
from app.repositories.appointments import AppointmentRepository
from app.repositories.errors import UniqueViolationError
from app.repositories.schedules import ScheduleRepository
from app.repositories.unit_of_work import UnitOfWork
from app.repositories.users import UserRepository
from app.schemas.agenda import (
    AppointmentTypeCreate,
    AppointmentTypeUpdate,
    ExceptionCreate,
    RoomCreate,
    RoomUpdate,
    WorkingBlockCreate,
    WorkingBlockUpdate,
)
from app.services.audit import AuditService, RequestContext
from app.services.patients import InvalidDoctorError

MAX_EXCEPTION_DAYS = 366


class InvalidScheduleError(BusinessRuleError):
    code = "invalid_schedule"


class ScheduleOverlapError(ConflictError):
    code = "schedule_overlap"


class DuplicateNameError(ConflictError):
    code = "duplicate_name"


class ScheduleService:
    def __init__(
        self,
        *,
        schedules: ScheduleRepository,
        rooms: RoomRepository,
        types: AppointmentTypeRepository,
        appointments: AppointmentRepository,
        users: UserRepository,
        audit: AuditService,
        uow: UnitOfWork,
    ) -> None:
        self._schedules = schedules
        self._rooms = rooms
        self._types = types
        self._appointments = appointments
        self._users = users
        self._audit = audit
        self._uow = uow

    # ------------------------------------------------------------------ horarios
    async def list_blocks(
        self, *, doctor_user_id: uuid.UUID | None, include_inactive: bool
    ) -> list[DoctorSchedule]:
        return await self._schedules.list_blocks(
            doctor_user_ids=[doctor_user_id] if doctor_user_id else None,
            only_active=not include_inactive,
        )

    async def create_block(
        self, actor: User, data: WorkingBlockCreate, context: RequestContext
    ) -> DoctorSchedule:
        await self._require_doctor(data.doctor_user_id)
        block = _as_working_block(
            data.weekday,
            data.start_time,
            data.end_time,
            data.slot_minutes,
            data.valid_from,
            data.valid_to,
        )
        self._validate(block)
        await self._ensure_no_block_overlap(data.doctor_user_id, block, exclude_id=None)

        created = await self._schedules.add_block(
            doctor_user_id=data.doctor_user_id,
            weekday=data.weekday,
            start_time=data.start_time,
            end_time=data.end_time,
            slot_minutes=data.slot_minutes,
            valid_from=data.valid_from,
            valid_to=data.valid_to,
            is_active=True,
        )
        await self._record(AuditAction.CREATE, actor, "schedule", created.id, context)
        await self._uow.commit()
        return created

    async def update_block(
        self, actor: User, block_id: uuid.UUID, data: WorkingBlockUpdate, context: RequestContext
    ) -> DoctorSchedule:
        existing = await self._schedules.get_block(block_id)
        if existing is None:
            raise NotFoundError("Horario no encontrado")
        changes = data.model_dump(exclude_unset=True)
        for key, value in changes.items():
            setattr(existing, key, value)

        block = _as_working_block(
            existing.weekday,
            existing.start_time,
            existing.end_time,
            existing.slot_minutes,
            existing.valid_from,
            existing.valid_to,
        )
        self._validate(block)
        if existing.is_active:
            await self._ensure_no_block_overlap(
                existing.doctor_user_id, block, exclude_id=existing.id
            )
        await self._schedules.reload_block(existing)
        await self._record(
            AuditAction.UPDATE, actor, "schedule", existing.id, context, reason=_fields(changes)
        )
        await self._uow.commit()
        return existing

    @staticmethod
    def _validate(block: WorkingBlock) -> None:
        try:
            validate_block(block)
        except AgendaRuleError as exc:
            raise InvalidScheduleError(str(exc)) from exc

    async def _ensure_no_block_overlap(
        self, doctor_user_id: uuid.UUID, block: WorkingBlock, *, exclude_id: uuid.UUID | None
    ) -> None:
        for other in await self._schedules.list_blocks(doctor_user_ids=[doctor_user_id]):
            if other.id == exclude_id:
                continue
            candidate = _as_working_block(
                other.weekday,
                other.start_time,
                other.end_time,
                other.slot_minutes,
                other.valid_from,
                other.valid_to,
            )
            if blocks_overlap(block, candidate):
                raise ScheduleOverlapError("El horario se cruza con otro bloque del mismo doctor")

    # --------------------------------------------------------------- excepciones
    async def list_exceptions(
        self,
        *,
        doctor_user_id: uuid.UUID | None,
        from_date: date | None,
        to_date: date | None,
    ) -> list[ScheduleException]:
        return await self._schedules.list_exceptions(
            doctor_user_id=doctor_user_id, from_date=from_date, to_date=to_date
        )

    async def create_exception(
        self, actor: User, data: ExceptionCreate, context: RequestContext
    ) -> tuple[ScheduleException, int]:
        if data.doctor_user_id is not None:
            await self._require_doctor(data.doctor_user_id)
        if (data.end_date - data.start_date).days >= MAX_EXCEPTION_DAYS:
            raise InvalidScheduleError(f"El rango no puede superar {MAX_EXCEPTION_DAYS} días")

        created = await self._schedules.add_exception(
            doctor_user_id=data.doctor_user_id,
            start_date=data.start_date,
            end_date=data.end_date,
            reason=data.reason.strip(),
            created_by=actor.id,
        )
        affected = await self._appointments.count_open_between(
            starts_from=at_clinic_time(data.start_date, time.min),
            starts_before=at_clinic_time(data.end_date + timedelta(days=1), time.min),
            doctor_user_id=data.doctor_user_id,
        )
        await self._record(
            AuditAction.CREATE,
            actor,
            "schedule_exception",
            created.id,
            context,
            reason="clínica" if data.doctor_user_id is None else "doctor",
        )
        await self._uow.commit()
        return created, affected

    async def delete_exception(
        self, actor: User, exception_id: uuid.UUID, context: RequestContext
    ) -> None:
        exception = await self._schedules.get_exception(exception_id)
        if exception is None:
            raise NotFoundError("Excepción no encontrada")
        await self._schedules.delete_exception(exception)
        await self._record(
            AuditAction.UPDATE,
            actor,
            "schedule_exception",
            exception_id,
            context,
            reason="eliminada",
        )
        await self._uow.commit()

    # --------------------------------------------------------------------- salas
    async def list_rooms(self, *, include_inactive: bool) -> list[Room]:
        return await self._rooms.list_rooms(only_active=not include_inactive)

    async def create_room(self, actor: User, data: RoomCreate, context: RequestContext) -> Room:
        try:
            room = await self._rooms.add(
                name=data.name,
                specialties=sorted(s.value for s in data.specialties),
                is_active=True,
            )
        except UniqueViolationError:
            await self._uow.rollback()
            raise DuplicateNameError("Ya existe una sala con ese nombre") from None
        await self._record(AuditAction.CREATE, actor, "room", room.id, context)
        await self._uow.commit()
        return room

    async def update_room(
        self, actor: User, room_id: uuid.UUID, data: RoomUpdate, context: RequestContext
    ) -> Room:
        room = await self._rooms.get(room_id)
        if room is None:
            raise NotFoundError("Sala no encontrada")
        changes = data.model_dump(exclude_unset=True)
        for key, value in changes.items():
            if key == "specialties" and value is not None:
                value = sorted(s.value for s in value)
            setattr(room, key, value)
        try:
            await self._rooms.flush()
        except UniqueViolationError:
            await self._uow.rollback()
            raise DuplicateNameError("Ya existe una sala con ese nombre") from None
        await self._record(
            AuditAction.UPDATE, actor, "room", room.id, context, reason=_fields(changes)
        )
        await self._uow.commit()
        return room

    # ------------------------------------------------------------ tipos de cita
    async def list_types(
        self, *, specialty: str | None, include_inactive: bool
    ) -> list[AppointmentType]:
        return await self._types.list_types(specialty=specialty, only_active=not include_inactive)

    async def create_type(
        self, actor: User, data: AppointmentTypeCreate, context: RequestContext
    ) -> AppointmentType:
        try:
            created = await self._types.add(
                specialty=data.specialty.value,
                name=data.name,
                duration_minutes=data.duration_minutes,
                is_active=True,
            )
        except UniqueViolationError:
            await self._uow.rollback()
            raise DuplicateNameError("Ya existe un tipo de cita con ese nombre") from None
        await self._record(AuditAction.CREATE, actor, "appointment_type", created.id, context)
        await self._uow.commit()
        return created

    async def update_type(
        self, actor: User, type_id: uuid.UUID, data: AppointmentTypeUpdate, context: RequestContext
    ) -> AppointmentType:
        appointment_type = await self._types.get(type_id)
        if appointment_type is None:
            raise NotFoundError("Tipo de cita no encontrado")
        changes = data.model_dump(exclude_unset=True)
        for key, value in changes.items():
            setattr(appointment_type, key, value)
        try:
            await self._types.flush()
        except UniqueViolationError:
            await self._uow.rollback()
            raise DuplicateNameError("Ya existe un tipo de cita con ese nombre") from None
        await self._record(
            AuditAction.UPDATE, actor, "appointment_type", type_id, context, reason=_fields(changes)
        )
        await self._uow.commit()
        return appointment_type

    # ----------------------------------------------------------------- internos
    async def _require_doctor(self, user_id: uuid.UUID) -> User:
        doctor = await self._users.get_by_id(user_id)
        if doctor is None or not doctor.is_active or Role.DOCTOR not in doctor.role_names:
            raise InvalidDoctorError("El usuario indicado no es un doctor activo")
        return doctor

    async def _record(
        self,
        action: AuditAction,
        actor: User,
        resource_type: str,
        resource_id: uuid.UUID,
        context: RequestContext,
        *,
        reason: str | None = None,
    ) -> None:
        await self._audit.record(
            action,
            actor_user_id=actor.id,
            actor_roles=actor.role_names,
            resource_type=resource_type,
            resource_id=str(resource_id),
            reason=reason,
            context=context,
        )


def _as_working_block(
    weekday: int,
    start: time,
    end: time,
    slot_minutes: int,
    valid_from: date | None,
    valid_to: date | None,
) -> WorkingBlock:
    return WorkingBlock(weekday, start, end, slot_minutes, valid_from, valid_to)


def _fields(changes: dict[str, object]) -> str:
    return "campos=" + (",".join(sorted(changes)) or "ninguno")
