"""DTOs de la agenda: horarios, excepciones, salas, tipos de cita, citas y disponibilidad."""

import uuid
from datetime import date, datetime, time
from typing import Annotated, Self

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

from app.domain.agenda_rules import MAX_SERIES_SESSIONS
from app.domain.enums import AppointmentStatus, Specialty

# Duración en minutos: múltiplos de 5 entre 5 y 240 (la regla de dominio vuelve a comprobarlo).
Duration = Annotated[int, Field(ge=5, le=240, multiple_of=5)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


# ------------------------------------------------------------------ horarios
class WorkingBlockCreate(BaseModel):
    doctor_user_id: uuid.UUID
    weekday: int = Field(ge=0, le=6, description="0 = lunes … 6 = domingo")
    start_time: time
    end_time: time
    slot_minutes: int = Field(default=30, ge=5, le=240)
    valid_from: date | None = None
    valid_to: date | None = None


class WorkingBlockUpdate(BaseModel):
    """Parcial. El doctor no se cambia: se crea otro bloque."""

    weekday: int | None = Field(default=None, ge=0, le=6)
    start_time: time | None = None
    end_time: time | None = None
    slot_minutes: int | None = Field(default=None, ge=5, le=240)
    valid_from: date | None = None
    valid_to: date | None = None
    is_active: bool | None = None


class WorkingBlockRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    doctor_user_id: uuid.UUID
    doctor_name: str
    weekday: int
    start_time: time
    end_time: time
    slot_minutes: int
    valid_from: date | None
    valid_to: date | None
    is_active: bool


# ---------------------------------------------------------------- excepciones
class ExceptionCreate(BaseModel):
    doctor_user_id: uuid.UUID | None = Field(
        default=None, description="Vacío = toda la clínica (feriado)"
    )
    start_date: date
    end_date: date
    reason: str = Field(min_length=1, max_length=200)

    @model_validator(mode="after")
    def range_is_ordered(self) -> Self:
        if self.end_date < self.start_date:
            raise ValueError("La fecha final no puede ser anterior a la inicial")
        return self


class ExceptionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    doctor_user_id: uuid.UUID | None
    doctor_name: str | None
    start_date: date
    end_date: date
    reason: str


class ExceptionCreated(ExceptionRead):
    # Citas ya programadas dentro del rango: NO se cancelan solas, recepción debe reprogramarlas.
    affected_appointments: int


# ----------------------------------------------------------- salas y tipos
class RoomCreate(BaseModel):
    name: Name
    specialties: set[Specialty] = Field(
        default_factory=set, description="Vacío = sirve para cualquier especialidad"
    )


class RoomUpdate(BaseModel):
    name: Name | None = None
    specialties: set[Specialty] | None = None
    is_active: bool | None = None


class RoomRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    specialties: list[Specialty]
    is_active: bool


class AppointmentTypeCreate(BaseModel):
    specialty: Specialty
    name: Name
    duration_minutes: Duration


class AppointmentTypeUpdate(BaseModel):
    name: Name | None = None
    duration_minutes: Duration | None = None
    is_active: bool | None = None


class AppointmentTypeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    specialty: Specialty
    name: str
    duration_minutes: int
    is_active: bool


# --------------------------------------------------------------------- citas
class AppointmentCreate(BaseModel):
    patient_id: uuid.UUID
    doctor_user_id: uuid.UUID
    specialty: Specialty
    starts_at: AwareDatetime
    # Si se omite se usa la duración del tipo de cita (uno de los dos es obligatorio).
    duration_minutes: Duration | None = None
    appointment_type_id: uuid.UUID | None = None
    room_id: uuid.UUID | None = None
    # SOLO logística (p. ej. "viene con su mamá"). Nunca datos clínicos: recepción lo ve.
    admin_notes: str | None = Field(default=None, max_length=500)


class SeriesCreate(AppointmentCreate):
    """Paquete de sesiones: misma hora local, cada `interval_days` días."""

    count: int = Field(ge=2, le=MAX_SERIES_SESSIONS)
    interval_days: int = Field(default=7, ge=1, le=30)


class RescheduleBody(BaseModel):
    """Mueve la cita. Se aplican los campos enviados (`room_id: null` quita la sala)."""

    starts_at: AwareDatetime
    duration_minutes: Duration | None = None
    doctor_user_id: uuid.UUID | None = None
    room_id: uuid.UUID | None = None


class CancelBody(BaseModel):
    reason: str = Field(min_length=1, max_length=200)


class AppointmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    patient_id: uuid.UUID
    patient_name: str
    patient_phone: str | None
    doctor_user_id: uuid.UUID
    doctor_name: str
    specialty: Specialty
    room_id: uuid.UUID | None
    room_name: str | None
    appointment_type_id: uuid.UUID | None
    type_name: str | None
    starts_at: datetime
    ends_at: datetime
    status: AppointmentStatus
    admin_notes: str | None
    cancel_reason: str | None
    series_id: uuid.UUID | None
    checked_in_at: datetime | None
    created_at: datetime


class SeriesResult(BaseModel):
    series_id: uuid.UUID
    appointments: list[AppointmentRead]


# -------------------------------------------------------------- disponibilidad
class AvailabilitySlot(BaseModel):
    starts_at: datetime
    ends_at: datetime


class DoctorAvailability(BaseModel):
    doctor_user_id: uuid.UUID
    doctor_name: str
    slots: list[AvailabilitySlot]
