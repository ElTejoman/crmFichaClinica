"""Casos de uso de citas: agendar, series, reprogramar, estados y disponibilidad.

Reglas clave (docs/07 §2):
- Una cita exige: paciente activo, doctor activo de esa especialidad, horario laboral del doctor,
  día sin excepciones y sin solapamiento de doctor/sala/paciente.
- La BD garantiza el no solapamiento (restricciones de exclusión); aquí se comprueba antes para
  dar mensajes claros y, ante una carrera, se traduce el error de la BD.
- Al agendar se crea la relación terapéutica doctor↔paciente (habilita al doctor a ver al paciente).
- Series de sesiones: todo o nada, con el detalle de cada sesión que falla.
- La cita NO guarda datos clínicos; las notas son solo logística.
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta

from app.core.clock import lima_today, utcnow
from app.core.errors import (
    AppError,
    BusinessRuleError,
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
)
from app.domain.agenda_rules import (
    MAX_AVAILABILITY_DAYS,
    RESCHEDULABLE_STATUSES,
    AgendaRuleError,
    WorkingBlock,
    at_clinic_time,
    clinic_date,
    fits_working_hours,
    generate_slots,
    in_exception,
    to_clinic_local,
    validate_duration,
    validate_not_in_past,
    validate_transition,
)
from app.domain.enums import AppointmentStatus, AuditAction, AuditOutcome, Role, Specialty
from app.domain.policies.permissions import sees_full_portfolio
from app.models.agenda import Appointment, AppointmentType, DoctorSchedule, Room
from app.models.patient import Patient
from app.models.user import User
from app.repositories.agenda_catalog import AppointmentTypeRepository, RoomRepository
from app.repositories.appointments import AppointmentRepository, Overlap
from app.repositories.care_team import CareTeamRepository
from app.repositories.errors import OverlapViolationError
from app.repositories.patients import PatientRepository
from app.repositories.schedules import ScheduleRepository
from app.repositories.unit_of_work import UnitOfWork
from app.repositories.users import UserRepository
from app.schemas.agenda import (
    AppointmentCreate,
    AvailabilitySlot,
    DoctorAvailability,
    RescheduleBody,
    SeriesCreate,
)
from app.services.audit import AuditService, RequestContext
from app.services.patients import InvalidDoctorError

RESOURCE_APPOINTMENT = "appointment"
RESOURCE_CARE_TEAM = "care_team"
DEFAULT_LIST_LIMIT = 200

_OVERLAP_MESSAGES = {
    "doctor": "El doctor ya tiene una cita en ese horario",
    "room": "La sala ya está ocupada en ese horario",
    "patient": "El paciente ya tiene otra cita en ese horario",
}


class AppointmentOverlapError(ConflictError):
    code = "appointment_overlap"


class OutsideWorkingHoursError(BusinessRuleError):
    code = "outside_working_hours"


class DoctorUnavailableError(BusinessRuleError):
    code = "doctor_unavailable"


class DoctorSpecialtyMismatchError(BusinessRuleError):
    code = "doctor_specialty_mismatch"


class InvalidRoomError(BusinessRuleError):
    code = "invalid_room"


class InvalidAppointmentTypeError(BusinessRuleError):
    code = "invalid_appointment_type"


class PatientInactiveError(BusinessRuleError):
    code = "patient_inactive"


class DurationRequiredError(BusinessRuleError):
    code = "duration_required"


class AppointmentInPastError(BusinessRuleError):
    code = "appointment_in_past"


class InvalidDurationError(BusinessRuleError):
    code = "invalid_duration"


class InvalidAppointmentTransitionError(BusinessRuleError):
    code = "invalid_appointment_transition"


class CheckInWrongDayError(BusinessRuleError):
    code = "check_in_wrong_day"


class NoShowTooEarlyError(BusinessRuleError):
    code = "no_show_too_early"


class NotReschedulableError(BusinessRuleError):
    code = "not_reschedulable"


class SeriesInvalidError(BusinessRuleError):
    code = "series_invalid"


class AvailabilityQueryError(BusinessRuleError):
    code = "invalid_availability_query"


@dataclass(frozen=True)
class _Plan:
    """Una cita ya validada, lista para guardarse."""

    starts_at: datetime
    ends_at: datetime
    patient: Patient
    doctor: User
    room: Room | None
    appointment_type: AppointmentType | None


class AppointmentService:
    def __init__(
        self,
        *,
        appointments: AppointmentRepository,
        schedules: ScheduleRepository,
        rooms: RoomRepository,
        types: AppointmentTypeRepository,
        patients: PatientRepository,
        care_team: CareTeamRepository,
        users: UserRepository,
        audit: AuditService,
        uow: UnitOfWork,
    ) -> None:
        self._appointments = appointments
        self._schedules = schedules
        self._rooms = rooms
        self._types = types
        self._patients = patients
        self._care_team = care_team
        self._users = users
        self._audit = audit
        self._uow = uow

    # ------------------------------------------------------------------- agendar
    async def create_appointment(
        self, actor: User, data: AppointmentCreate, context: RequestContext
    ) -> Appointment:
        plan = await self._plan(
            patient_id=data.patient_id,
            doctor_user_id=data.doctor_user_id,
            specialty=data.specialty,
            starts_at=data.starts_at,
            duration_minutes=data.duration_minutes,
            type_id=data.appointment_type_id,
            room_id=data.room_id,
        )
        await self._raise_on_overlap(plan)
        appointment = await self._insert(actor, plan, data.specialty, data.admin_notes, None)
        await self._ensure_care_relationship(actor, plan, context)
        await self._record(AuditAction.CREATE, actor, appointment, context, reason="agendada")
        await self._uow.commit()
        return appointment

    async def create_series(
        self, actor: User, data: SeriesCreate, context: RequestContext
    ) -> tuple[uuid.UUID, list[Appointment]]:
        """Crea N sesiones a la misma hora LOCAL cada `interval_days` días. Todo o nada."""
        first_local = to_clinic_local(data.starts_at)
        plans: list[_Plan] = []
        problems: list[dict[str, object]] = []
        for index in range(data.count):
            starts_at = (first_local + timedelta(days=index * data.interval_days)).astimezone(UTC)
            try:
                plan = await self._plan(
                    patient_id=data.patient_id,
                    doctor_user_id=data.doctor_user_id,
                    specialty=data.specialty,
                    starts_at=starts_at,
                    duration_minutes=data.duration_minutes,
                    type_id=data.appointment_type_id,
                    room_id=data.room_id,
                )
                await self._raise_on_overlap(plan)
                plans.append(plan)
            except AppError as exc:
                problems.append(
                    {
                        "session": index + 1,
                        "starts_at": starts_at.isoformat(),
                        "code": exc.code,
                        "message": exc.message,
                    }
                )
        if problems:
            raise SeriesInvalidError(
                "No se pudo agendar la serie completa; revise las sesiones indicadas",
                details={"sessions": problems},
            )

        series_id = uuid.uuid4()
        created = [
            await self._insert(actor, plan, data.specialty, data.admin_notes, series_id)
            for plan in plans
        ]
        await self._ensure_care_relationship(actor, plans[0], context)
        await self._record(
            AuditAction.CREATE,
            actor,
            created[0],
            context,
            reason=f"serie de {len(created)} sesiones",
        )
        await self._uow.commit()
        return series_id, created

    async def _insert(
        self,
        actor: User,
        plan: _Plan,
        specialty: Specialty,
        admin_notes: str | None,
        series_id: uuid.UUID | None,
    ) -> Appointment:
        try:
            return await self._appointments.add(
                patient_id=plan.patient.id,
                doctor_user_id=plan.doctor.id,
                specialty=specialty.value,
                room_id=plan.room.id if plan.room else None,
                appointment_type_id=plan.appointment_type.id if plan.appointment_type else None,
                starts_at=plan.starts_at,
                ends_at=plan.ends_at,
                status=AppointmentStatus.SCHEDULED.value,
                admin_notes=admin_notes,
                series_id=series_id,
                created_by=actor.id,
            )
        except OverlapViolationError as exc:
            # Carrera: otra petición ocupó el hueco entre nuestra comprobación y el INSERT.
            await self._uow.rollback()
            raise AppointmentOverlapError(_OVERLAP_MESSAGES[exc.resource]) from None

    # -------------------------------------------------------------- validación
    async def _plan(
        self,
        *,
        patient_id: uuid.UUID,
        doctor_user_id: uuid.UUID,
        specialty: Specialty,
        starts_at: datetime,
        duration_minutes: int | None,
        type_id: uuid.UUID | None,
        room_id: uuid.UUID | None,
    ) -> _Plan:
        """Valida TODO lo necesario para agendar y devuelve la cita lista (o lanza el error)."""
        try:
            validate_not_in_past(starts_at, utcnow())
        except AgendaRuleError as exc:
            raise AppointmentInPastError(str(exc)) from exc

        patient = await self._patients.get(patient_id)
        if patient is None:
            raise NotFoundError("Paciente no encontrado")
        if not patient.is_active:
            raise PatientInactiveError("El paciente está archivado: reactívelo para agendar")

        doctor = await self._require_doctor(doctor_user_id, specialty)
        appointment_type = await self._resolve_type(type_id, specialty)
        duration = duration_minutes or (
            appointment_type.duration_minutes if appointment_type else None
        )
        if duration is None:
            raise DurationRequiredError("Indique la duración o un tipo de cita")
        try:
            validate_duration(duration)
        except AgendaRuleError as exc:
            raise InvalidDurationError(str(exc)) from exc

        ends_at = starts_at + timedelta(minutes=duration)
        await self._ensure_doctor_available(doctor, starts_at, ends_at)
        room = await self._resolve_room(room_id, specialty)
        return _Plan(starts_at, ends_at, patient, doctor, room, appointment_type)

    async def _require_doctor(self, user_id: uuid.UUID, specialty: Specialty) -> User:
        doctor = await self._users.get_by_id(user_id)
        if doctor is None or not doctor.is_active or Role.DOCTOR not in doctor.role_names:
            raise InvalidDoctorError("El usuario indicado no es un doctor activo")
        offered = doctor.doctor_profile.specialty_names if doctor.doctor_profile else []
        if specialty not in offered:
            raise DoctorSpecialtyMismatchError("El doctor no atiende esa especialidad")
        return doctor

    async def _resolve_type(
        self, type_id: uuid.UUID | None, specialty: Specialty
    ) -> AppointmentType | None:
        if type_id is None:
            return None
        appointment_type = await self._types.get(type_id)
        if (
            appointment_type is None
            or not appointment_type.is_active
            or appointment_type.specialty != specialty.value
        ):
            raise InvalidAppointmentTypeError(
                "El tipo de cita no existe o no es de esa especialidad"
            )
        return appointment_type

    async def _resolve_room(self, room_id: uuid.UUID | None, specialty: Specialty) -> Room | None:
        if room_id is None:
            return None
        room = await self._rooms.get(room_id)
        if room is None or not room.is_active:
            raise InvalidRoomError("La sala no existe o está inactiva")
        if room.specialties and specialty.value not in room.specialties:
            raise InvalidRoomError("La sala no es apta para esa especialidad")
        return room

    async def _ensure_doctor_available(
        self, doctor: User, starts_at: datetime, ends_at: datetime
    ) -> None:
        day = clinic_date(starts_at)
        exceptions = await self._schedules.list_exceptions(
            doctor_user_id=doctor.id, from_date=day, to_date=day
        )
        if exceptions:
            raise DoctorUnavailableError(f"El doctor no atiende ese día: {exceptions[0].reason}")
        blocks = _working_blocks(await self._schedules.list_blocks(doctor_user_ids=[doctor.id]))
        if not blocks:
            raise OutsideWorkingHoursError("El doctor no tiene un horario de atención configurado")
        if not fits_working_hours(starts_at, ends_at, blocks):
            raise OutsideWorkingHoursError("La cita queda fuera del horario de atención del doctor")

    async def _raise_on_overlap(self, plan: _Plan, *, exclude_id: uuid.UUID | None = None) -> None:
        overlaps = await self._appointments.find_overlaps(
            starts_at=plan.starts_at,
            ends_at=plan.ends_at,
            doctor_user_id=plan.doctor.id,
            patient_id=plan.patient.id,
            room_id=plan.room.id if plan.room else None,
            exclude_id=exclude_id,
        )
        if overlaps:
            raise _overlap_error(overlaps)

    async def _ensure_care_relationship(
        self, actor: User, plan: _Plan, context: RequestContext
    ) -> None:
        """Agendar con un doctor lo vuelve parte del equipo tratante del paciente."""
        if await self._care_team.is_active_member(plan.patient.id, plan.doctor.id):
            return
        member = await self._care_team.add(
            patient_id=plan.patient.id,
            doctor_user_id=plan.doctor.id,
            since=utcnow(),
            created_by=actor.id,
        )
        await self._audit.record(
            AuditAction.CREATE,
            actor_user_id=actor.id,
            actor_roles=actor.role_names,
            resource_type=RESOURCE_CARE_TEAM,
            resource_id=str(member.id),
            patient_id=plan.patient.id,
            reason="al agendar",
            context=context,
        )

    # ------------------------------------------------------------------ lectura
    async def list_appointments(
        self,
        actor: User,
        *,
        starts_from: datetime | None,
        starts_before: datetime | None,
        doctor_user_id: uuid.UUID | None,
        specialty: str | None,
        status: AppointmentStatus | None,
        patient_id: uuid.UUID | None,
        room_id: uuid.UUID | None,
        limit: int = DEFAULT_LIST_LIMIT,
        offset: int = 0,
    ) -> list[Appointment]:
        """Un doctor solo ve SUS citas, sin importar el filtro que envíe."""
        if not sees_full_portfolio(actor.role_names):
            doctor_user_id = actor.id
        return await self._appointments.list_appointments(
            limit=limit,
            offset=offset,
            starts_from=starts_from,
            starts_before=starts_before,
            doctor_user_id=doctor_user_id,
            specialty=specialty,
            status=status.value if status else None,
            patient_id=patient_id,
            room_id=room_id,
        )

    async def get_appointment(
        self, actor: User, appointment_id: uuid.UUID, context: RequestContext
    ) -> Appointment:
        appointment = await self._require(appointment_id)
        await self._ensure_visible(actor, appointment, context)
        await self._audit.record(
            AuditAction.READ,
            actor_user_id=actor.id,
            actor_roles=actor.role_names,
            resource_type=RESOURCE_APPOINTMENT,
            resource_id=str(appointment.id),
            patient_id=appointment.patient_id,
            context=context,
        )
        await self._uow.commit()
        return appointment

    async def list_series(
        self, actor: User, series_id: uuid.UUID, context: RequestContext
    ) -> list[Appointment]:
        appointments = await self._appointments.list_series(series_id)
        if not appointments:
            raise NotFoundError("Serie no encontrada")
        for appointment in appointments:
            await self._ensure_visible(actor, appointment, context)
        return appointments

    async def _ensure_visible(
        self, actor: User, appointment: Appointment, context: RequestContext
    ) -> None:
        if sees_full_portfolio(actor.role_names) or appointment.doctor_user_id == actor.id:
            return
        await self._deny(actor, appointment, "cita de otro doctor", context)

    async def _deny(
        self, actor: User, appointment: Appointment, reason: str, context: RequestContext
    ) -> None:
        await self._audit.record(
            AuditAction.PERMISSION_DENIED,
            outcome=AuditOutcome.DENIED,
            actor_user_id=actor.id,
            actor_roles=actor.role_names,
            resource_type=RESOURCE_APPOINTMENT,
            resource_id=str(appointment.id),
            patient_id=appointment.patient_id,
            reason=reason,
            context=context,
        )
        await self._uow.commit()
        raise PermissionDeniedError("No tienes acceso a esta cita")

    # ------------------------------------------------------------------- estados
    async def confirm(
        self, actor: User, appointment_id: uuid.UUID, context: RequestContext
    ) -> Appointment:
        return await self._transition(actor, appointment_id, AppointmentStatus.CONFIRMED, context)

    async def check_in(
        self, actor: User, appointment_id: uuid.UUID, context: RequestContext
    ) -> Appointment:
        appointment = await self._require(appointment_id)
        if clinic_date(appointment.starts_at) != lima_today():
            raise CheckInWrongDayError("Solo se puede registrar la llegada el día de la cita")
        appointment.checked_in_at = utcnow()
        return await self._transition(actor, appointment_id, AppointmentStatus.CHECKED_IN, context)

    async def start(
        self, actor: User, appointment_id: uuid.UUID, context: RequestContext
    ) -> Appointment:
        return await self._transition(
            actor,
            appointment_id,
            AppointmentStatus.IN_PROGRESS,
            context,
            attending_doctor_only=True,
        )

    async def complete(
        self, actor: User, appointment_id: uuid.UUID, context: RequestContext
    ) -> Appointment:
        return await self._transition(
            actor, appointment_id, AppointmentStatus.COMPLETED, context, attending_doctor_only=True
        )

    async def cancel(
        self, actor: User, appointment_id: uuid.UUID, reason: str, context: RequestContext
    ) -> Appointment:
        appointment = await self._require(appointment_id)
        appointment.cancel_reason = reason.strip()
        return await self._transition(actor, appointment_id, AppointmentStatus.CANCELLED, context)

    async def mark_no_show(
        self, actor: User, appointment_id: uuid.UUID, context: RequestContext
    ) -> Appointment:
        appointment = await self._require(appointment_id)
        if appointment.starts_at > utcnow():
            raise NoShowTooEarlyError("No se puede marcar ausencia antes de la hora de la cita")
        return await self._transition(actor, appointment_id, AppointmentStatus.NO_SHOW, context)

    async def _transition(
        self,
        actor: User,
        appointment_id: uuid.UUID,
        target: AppointmentStatus,
        context: RequestContext,
        *,
        attending_doctor_only: bool = False,
    ) -> Appointment:
        appointment = await self._require(appointment_id)
        if attending_doctor_only and appointment.doctor_user_id != actor.id:
            await self._deny(actor, appointment, "atención de otro doctor", context)
        try:
            validate_transition(AppointmentStatus(appointment.status), target)
        except AgendaRuleError as exc:
            await self._uow.rollback()  # descarta cambios previos (p. ej. motivo de cancelación)
            raise InvalidAppointmentTransitionError(str(exc)) from exc
        appointment.status = target.value
        await self._appointments.flush()
        await self._record(
            AuditAction.UPDATE, actor, appointment, context, reason=f"estado={target.value}"
        )
        await self._uow.commit()
        return appointment

    # ------------------------------------------------------------ reprogramar
    async def reschedule(
        self,
        actor: User,
        appointment_id: uuid.UUID,
        data: RescheduleBody,
        context: RequestContext,
    ) -> Appointment:
        appointment = await self._require(appointment_id)
        if AppointmentStatus(appointment.status) not in RESCHEDULABLE_STATUSES:
            raise NotReschedulableError(
                "Solo se pueden reprogramar citas programadas o confirmadas"
            )

        sent = data.model_fields_set
        current_minutes = int((appointment.ends_at - appointment.starts_at).total_seconds() // 60)
        plan = await self._plan(
            patient_id=appointment.patient_id,
            doctor_user_id=data.doctor_user_id or appointment.doctor_user_id,
            specialty=Specialty(appointment.specialty),
            starts_at=data.starts_at,
            duration_minutes=data.duration_minutes or current_minutes,
            type_id=appointment.appointment_type_id,
            room_id=data.room_id if "room_id" in sent else appointment.room_id,
        )
        await self._raise_on_overlap(plan, exclude_id=appointment.id)

        doctor_changed = plan.doctor.id != appointment.doctor_user_id
        appointment.starts_at = plan.starts_at
        appointment.ends_at = plan.ends_at
        appointment.doctor_user_id = plan.doctor.id
        appointment.room_id = plan.room.id if plan.room else None
        # Mover la cita exige que el paciente la vuelva a confirmar.
        appointment.status = AppointmentStatus.SCHEDULED.value
        try:
            await self._appointments.flush()
        except OverlapViolationError as exc:
            await self._uow.rollback()
            raise AppointmentOverlapError(_OVERLAP_MESSAGES[exc.resource]) from None
        await self._appointments.reload_relations(appointment)
        if doctor_changed:
            await self._ensure_care_relationship(actor, plan, context)
        await self._record(AuditAction.UPDATE, actor, appointment, context, reason="reprogramada")
        await self._uow.commit()
        return appointment

    # ----------------------------------------------------------- disponibilidad
    async def availability(
        self,
        *,
        doctor_user_id: uuid.UUID | None,
        specialty: Specialty | None,
        from_date: date,
        to_date: date,
        duration_minutes: int | None,
        type_id: uuid.UUID | None,
    ) -> list[DoctorAvailability]:
        """Huecos libres por doctor entre dos fechas (hora local de la clínica)."""
        if to_date < from_date:
            raise AvailabilityQueryError("La fecha final no puede ser anterior a la inicial")
        if (to_date - from_date).days + 1 > MAX_AVAILABILITY_DAYS:
            raise AvailabilityQueryError(f"Consulte como máximo {MAX_AVAILABILITY_DAYS} días")
        if doctor_user_id is None and specialty is None:
            raise AvailabilityQueryError("Indique un doctor o una especialidad")

        appointment_type: AppointmentType | None = None
        if type_id is not None:
            appointment_type = await self._types.get(type_id)
            if appointment_type is None or not appointment_type.is_active:
                raise InvalidAppointmentTypeError("El tipo de cita no existe o está inactivo")
            if specialty is None:
                specialty = Specialty(
                    appointment_type.specialty
                )  # el tipo ya define la especialidad
            elif appointment_type.specialty != specialty.value:
                raise InvalidAppointmentTypeError("El tipo de cita no es de esa especialidad")
        duration = duration_minutes or (
            appointment_type.duration_minutes if appointment_type else None
        )
        if duration is None:
            raise DurationRequiredError("Indique la duración o un tipo de cita")
        try:
            validate_duration(duration)
        except AgendaRuleError as exc:
            raise InvalidDurationError(str(exc)) from exc

        doctors = await self._doctors_for(doctor_user_id, specialty)
        if not doctors:
            return []
        ids = [d.id for d in doctors]
        window_start = at_clinic_time(from_date, time.min)
        window_end = at_clinic_time(to_date + timedelta(days=1), time.min)
        blocks = await self._schedules.list_blocks(doctor_user_ids=ids)
        exceptions = await self._schedules.list_exceptions(from_date=from_date, to_date=to_date)
        busy = await self._appointments.busy_intervals(
            doctor_user_ids=ids, starts_from=window_start, starts_before=window_end
        )

        now = utcnow()
        result: list[DoctorAvailability] = []
        for doctor in doctors:
            doctor_blocks = _working_blocks([b for b in blocks if b.doctor_user_id == doctor.id])
            off_days = [
                (e.start_date, e.end_date)
                for e in exceptions
                if e.doctor_user_id in (None, doctor.id)
            ]
            doctor_busy = [(s, e) for d, s, e in busy if d == doctor.id]
            slots: list[AvailabilitySlot] = []
            for offset in range((to_date - from_date).days + 1):
                day = from_date + timedelta(days=offset)
                if in_exception(day, off_days):
                    continue
                for start in generate_slots(
                    blocks=doctor_blocks,
                    day=day,
                    duration_minutes=duration,
                    busy=doctor_busy,
                    now=now,
                ):
                    slots.append(
                        AvailabilitySlot(
                            starts_at=start, ends_at=start + timedelta(minutes=duration)
                        )
                    )
            result.append(
                DoctorAvailability(
                    doctor_user_id=doctor.id, doctor_name=doctor.full_name, slots=slots
                )
            )
        return result

    async def _doctors_for(
        self, doctor_user_id: uuid.UUID | None, specialty: Specialty | None
    ) -> list[User]:
        if doctor_user_id is not None:
            doctor = await self._users.get_by_id(doctor_user_id)
            if doctor is None or not doctor.is_active or Role.DOCTOR not in doctor.role_names:
                raise InvalidDoctorError("El usuario indicado no es un doctor activo")
            return [doctor]
        doctors = await self._users.list_doctors()
        return [
            d
            for d in doctors
            if specialty is not None
            and d.doctor_profile
            and specialty in d.doctor_profile.specialty_names
        ]

    # ----------------------------------------------------------------- internos
    async def _require(self, appointment_id: uuid.UUID) -> Appointment:
        appointment = await self._appointments.get(appointment_id)
        if appointment is None:
            raise NotFoundError("Cita no encontrada")
        return appointment

    async def _record(
        self,
        action: AuditAction,
        actor: User,
        appointment: Appointment,
        context: RequestContext,
        *,
        reason: str,
    ) -> None:
        await self._audit.record(
            action,
            actor_user_id=actor.id,
            actor_roles=actor.role_names,
            resource_type=RESOURCE_APPOINTMENT,
            resource_id=str(appointment.id),
            patient_id=appointment.patient_id,
            reason=reason,
            context=context,
        )


# ----------------------------------------------------------------- helpers
def _working_blocks(rows: Sequence[DoctorSchedule]) -> list[WorkingBlock]:
    return [
        WorkingBlock(r.weekday, r.start_time, r.end_time, r.slot_minutes, r.valid_from, r.valid_to)
        for r in rows
    ]


def _overlap_error(overlaps: list[Overlap]) -> AppointmentOverlapError:
    first = overlaps[0].resource
    return AppointmentOverlapError(
        _OVERLAP_MESSAGES[first],
        details={
            "resource": first,
            # Solo horarios: no se expone qué paciente ocupa el hueco de otro recurso.
            "conflicts": [
                {
                    "resource": o.resource,
                    "starts_at": o.appointment.starts_at.isoformat(),
                    "ends_at": o.appointment.ends_at.isoformat(),
                }
                for o in overlaps
            ],
        },
    )
