"""Utilidades para los tests de agenda: fechas locales, inserción directa de citas."""

import uuid
from datetime import UTC, date, datetime, time, timedelta

from app.core.clock import lima_today
from app.domain.agenda_rules import at_clinic_time
from app.models.agenda import Appointment
from app.repositories.appointments import AppointmentRepository
from tests.helpers import SessionFactory


def iso(day: date, hour: int, minute: int = 0) -> str:
    """Instante ISO (UTC) de una hora LOCAL de Lima: lo que enviaría el frontend."""
    return at_clinic_time(day, time(hour, minute)).isoformat()


def next_monday(min_days_ahead: int = 8) -> date:
    """Un lunes futuro (≥ `min_days_ahead` días): así las citas nunca caen en el pasado."""
    day = lima_today() + timedelta(days=min_days_ahead)
    while day.weekday() != 0:
        day += timedelta(days=1)
    return day


async def insert_appointment(
    session_factory: SessionFactory,
    *,
    patient_id: str,
    doctor_id: str,
    starts_at: datetime,
    minutes: int = 30,
    status: str = "SCHEDULED",
    specialty: str = "ACUPUNCTURE",
) -> Appointment:
    """Inserta una cita saltándose las reglas de agendado.

    Necesario para probar el check-in (misma fecha) o la ausencia (hora pasada): la API no
    permite agendar en el pasado y "hoy" puede no tener horario laboral según la hora real.
    """
    async with session_factory() as session:
        appointment = await AppointmentRepository(session).add(
            patient_id=uuid.UUID(patient_id),
            doctor_user_id=uuid.UUID(doctor_id),
            specialty=specialty,
            starts_at=starts_at.astimezone(UTC),
            ends_at=(starts_at + timedelta(minutes=minutes)).astimezone(UTC),
            status=status,
        )
        await session.commit()
        return appointment
