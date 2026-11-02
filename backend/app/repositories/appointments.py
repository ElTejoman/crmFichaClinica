"""Persistencia de citas: consultas de calendario, solapamientos y disponibilidad."""

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import ColumnElement, Select, and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.agenda_rules import ACTIVE_STATUSES
from app.domain.enums import AppointmentStatus
from app.models.agenda import Appointment
from app.repositories.errors import OverlapViolationError

_ACTIVE = [s.value for s in ACTIVE_STATUSES]
# Nombre de la restricción de la BD → recurso que se solapa.
_CONSTRAINT_TO_RESOURCE = {
    "ex_appointments_doctor_overlap": "doctor",
    "ex_appointments_room_overlap": "room",
    "ex_appointments_patient_overlap": "patient",
}


@dataclass(frozen=True)
class Overlap:
    resource: str  # doctor | room | patient
    appointment: Appointment


class AppointmentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, **fields: Any) -> Appointment:
        appointment = Appointment(**fields)
        self._session.add(appointment)
        await self.flush()
        await self._session.refresh(
            appointment, attribute_names=["patient", "doctor", "room", "appointment_type"]
        )
        return appointment

    async def flush(self) -> None:
        """Confirma cambios en la sesión traduciendo el error de exclusión de la BD.

        Es la red de seguridad frente a carreras: aunque el servicio compruebe antes, dos
        peticiones simultáneas pueden llegar aquí a la vez y solo una puede ganar.
        """
        try:
            await self._session.flush()
        except IntegrityError as exc:
            message = str(exc.orig)
            for constraint, resource in _CONSTRAINT_TO_RESOURCE.items():
                if constraint in message:
                    raise OverlapViolationError(resource) from exc
            raise

    async def reload_relations(self, appointment: Appointment) -> None:
        """Tras reprogramar o cambiar sala, recarga las relaciones mostradas en la respuesta."""
        await self._session.flush()
        await self._session.refresh(
            appointment, attribute_names=["patient", "doctor", "room", "appointment_type"]
        )

    async def get(self, appointment_id: uuid.UUID) -> Appointment | None:
        return await self._session.get(Appointment, appointment_id)

    def _filtered(
        self,
        *,
        starts_from: datetime | None,
        starts_before: datetime | None,
        doctor_user_id: uuid.UUID | None,
        specialty: str | None,
        status: str | None,
        patient_id: uuid.UUID | None,
        room_id: uuid.UUID | None,
    ) -> Select[Appointment]:
        statement = select(Appointment)
        conditions: list[ColumnElement[bool]] = []
        if starts_from is not None:
            conditions.append(Appointment.ends_at > starts_from)
        if starts_before is not None:
            conditions.append(Appointment.starts_at < starts_before)
        if doctor_user_id is not None:
            conditions.append(Appointment.doctor_user_id == doctor_user_id)
        if specialty:
            conditions.append(Appointment.specialty == specialty)
        if status:
            conditions.append(Appointment.status == status)
        if patient_id is not None:
            conditions.append(Appointment.patient_id == patient_id)
        if room_id is not None:
            conditions.append(Appointment.room_id == room_id)
        return statement.where(*conditions)

    async def list_appointments(
        self,
        *,
        limit: int,
        offset: int,
        starts_from: datetime | None = None,
        starts_before: datetime | None = None,
        doctor_user_id: uuid.UUID | None = None,
        specialty: str | None = None,
        status: str | None = None,
        patient_id: uuid.UUID | None = None,
        room_id: uuid.UUID | None = None,
    ) -> list[Appointment]:
        statement = self._filtered(
            starts_from=starts_from,
            starts_before=starts_before,
            doctor_user_id=doctor_user_id,
            specialty=specialty,
            status=status,
            patient_id=patient_id,
            room_id=room_id,
        )
        result = await self._session.execute(
            statement.order_by(Appointment.starts_at, Appointment.id).limit(limit).offset(offset)
        )
        return list(result.scalars())

    async def find_overlaps(
        self,
        *,
        starts_at: datetime,
        ends_at: datetime,
        doctor_user_id: uuid.UUID,
        patient_id: uuid.UUID,
        room_id: uuid.UUID | None,
        exclude_id: uuid.UUID | None = None,
    ) -> list[Overlap]:
        """Citas activas que se pisan con el intervalo, indicando qué recurso choca.

        Sirve para dar un error detallado y para validar series completas ANTES de insertar.
        La garantía real la da la restricción de la BD; esto es solo la parte amable.
        """
        same_resource: list[ColumnElement[bool]] = [
            Appointment.doctor_user_id == doctor_user_id,
            Appointment.patient_id == patient_id,
        ]
        if room_id is not None:
            same_resource.append(Appointment.room_id == room_id)
        statement = select(Appointment).where(
            Appointment.status.in_(_ACTIVE),
            Appointment.starts_at < ends_at,
            Appointment.ends_at > starts_at,
            or_(*same_resource),
        )
        if exclude_id is not None:
            statement = statement.where(Appointment.id != exclude_id)
        found = (await self._session.execute(statement.order_by(Appointment.starts_at))).scalars()
        overlaps: list[Overlap] = []
        for appointment in found:
            if appointment.doctor_user_id == doctor_user_id:
                overlaps.append(Overlap("doctor", appointment))
            if appointment.patient_id == patient_id:
                overlaps.append(Overlap("patient", appointment))
            if room_id is not None and appointment.room_id == room_id:
                overlaps.append(Overlap("room", appointment))
        return overlaps

    async def busy_intervals(
        self, *, doctor_user_ids: list[uuid.UUID], starts_from: datetime, starts_before: datetime
    ) -> list[tuple[uuid.UUID, datetime, datetime]]:
        """Intervalos ocupados por doctor (para calcular huecos libres)."""
        statement = select(
            Appointment.doctor_user_id, Appointment.starts_at, Appointment.ends_at
        ).where(
            Appointment.doctor_user_id.in_(doctor_user_ids),
            Appointment.status.in_(_ACTIVE),
            and_(Appointment.ends_at > starts_from, Appointment.starts_at < starts_before),
        )
        return [(row[0], row[1], row[2]) for row in (await self._session.execute(statement)).all()]

    async def count_open_between(
        self,
        *,
        starts_from: datetime,
        starts_before: datetime,
        doctor_user_id: uuid.UUID | None,
    ) -> int:
        """Citas aún por atender (programadas, confirmadas o en sala) dentro del rango."""
        open_statuses = [
            AppointmentStatus.SCHEDULED.value,
            AppointmentStatus.CONFIRMED.value,
            AppointmentStatus.CHECKED_IN.value,
        ]
        statement = (
            select(func.count())
            .select_from(Appointment)
            .where(
                Appointment.status.in_(open_statuses),
                Appointment.starts_at >= starts_from,
                Appointment.starts_at < starts_before,
            )
        )
        if doctor_user_id is not None:
            statement = statement.where(Appointment.doctor_user_id == doctor_user_id)
        return int((await self._session.execute(statement)).scalar_one())

    async def list_series(self, series_id: uuid.UUID) -> list[Appointment]:
        result = await self._session.execute(
            select(Appointment)
            .where(Appointment.series_id == series_id)
            .order_by(Appointment.starts_at)
        )
        return list(result.scalars())
