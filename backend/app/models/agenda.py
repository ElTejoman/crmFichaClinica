"""Agenda: horarios de doctores, excepciones, salas, tipos de cita y citas.

La garantía de **no solapamiento** vive en la BASE DE DATOS (restricciones de exclusión con
`btree_gist`), no solo en el código: dos peticiones simultáneas no pueden agendar el mismo
doctor, sala o paciente en horarios que se pisan, aunque el servicio lo intente.
"""

import uuid
from datetime import date, datetime, time
from typing import Any

from sqlalchemy import (
    ARRAY,
    Boolean,
    CheckConstraint,
    ColumnElement,
    Date,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Time,
    Uuid,
    literal_column,
    text,
)
from sqlalchemy.dialects.postgresql import ExcludeConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin, UuidPrimaryKeyMixin
from app.models.patient import Patient
from app.models.user import User

# Citas que ocupan el calendario: cancelar o marcar ausencia libera el hueco.
_OCCUPYING = text("status NOT IN ('CANCELLED', 'NO_SHOW')")
# Rango semiabierto [inicio, fin): dos citas consecutivas no se consideran solapadas.
_TIME_RANGE: ColumnElement[Any] = literal_column("tstzrange(starts_at, ends_at, '[)')")


class DoctorSchedule(UuidPrimaryKeyMixin, TimestampMixin, Base):
    """Bloque de trabajo semanal de un doctor, en hora local de la clínica."""

    __tablename__ = "doctor_schedules"
    __table_args__ = (
        CheckConstraint("weekday BETWEEN 0 AND 6", name="ck_schedule_weekday"),
        CheckConstraint("end_time > start_time", name="ck_schedule_end_after_start"),
        CheckConstraint("slot_minutes BETWEEN 5 AND 240", name="ck_schedule_slot"),
    )

    doctor_user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    weekday: Mapped[int] = mapped_column(SmallInteger)  # 0 = lunes … 6 = domingo
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)
    slot_minutes: Mapped[int] = mapped_column(SmallInteger, default=30)
    valid_from: Mapped[date | None] = mapped_column(Date, default=None)
    valid_to: Mapped[date | None] = mapped_column(Date, default=None)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    doctor: Mapped[User] = relationship("User", lazy="selectin", viewonly=True)

    @property
    def doctor_name(self) -> str:
        return self.doctor.full_name


class ScheduleException(UuidPrimaryKeyMixin, TimestampMixin, Base):
    """Días no laborables: vacaciones de un doctor o feriado de TODA la clínica."""

    __tablename__ = "schedule_exceptions"
    __table_args__ = (CheckConstraint("end_date >= start_date", name="ck_exception_range"),)

    # NULL = toda la clínica (feriado); con valor = solo ese doctor.
    doctor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id"), index=True, default=None
    )
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    reason: Mapped[str] = mapped_column(String(200))
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), default=None)

    doctor: Mapped[User | None] = relationship(
        "User", foreign_keys=[doctor_user_id], lazy="selectin", viewonly=True
    )

    @property
    def doctor_name(self) -> str | None:
        return self.doctor.full_name if self.doctor else None


class Room(UuidPrimaryKeyMixin, TimestampMixin, Base):
    """Consultorio / camilla / sillón. `specialties` vacío = sirve para cualquier especialidad."""

    __tablename__ = "rooms"

    name: Mapped[str] = mapped_column(String(80), unique=True)
    specialties: Mapped[list[str]] = mapped_column(ARRAY(String(20)), default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class AppointmentType(UuidPrimaryKeyMixin, TimestampMixin, Base):
    """Tipo de cita por especialidad con su duración por defecto (configurable)."""

    __tablename__ = "appointment_types"
    __table_args__ = (
        Index("uq_appointment_types_specialty_name", "specialty", "name", unique=True),
        CheckConstraint("duration_minutes BETWEEN 5 AND 240", name="ck_type_duration"),
    )

    specialty: Mapped[str] = mapped_column(String(20), index=True)
    name: Mapped[str] = mapped_column(String(80))
    duration_minutes: Mapped[int] = mapped_column(SmallInteger)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Appointment(UuidPrimaryKeyMixin, TimestampMixin, Base):
    """Cita. NO contiene datos clínicos: `admin_notes` es solo logística (recepción lo ve)."""

    __tablename__ = "appointments"
    __table_args__ = (
        CheckConstraint("ends_at > starts_at", name="ck_appointment_range"),
        ExcludeConstraint(
            ("doctor_user_id", "="),
            (_TIME_RANGE, "&&"),
            where=_OCCUPYING,
            using="gist",
            name="ex_appointments_doctor_overlap",
        ),
        ExcludeConstraint(
            ("room_id", "="),
            (_TIME_RANGE, "&&"),
            where=text("room_id IS NOT NULL AND status NOT IN ('CANCELLED', 'NO_SHOW')"),
            using="gist",
            name="ex_appointments_room_overlap",
        ),
        ExcludeConstraint(
            ("patient_id", "="),
            (_TIME_RANGE, "&&"),
            where=_OCCUPYING,
            using="gist",
            name="ex_appointments_patient_overlap",
        ),
        Index("ix_appointments_doctor_starts", "doctor_user_id", "starts_at"),
        Index("ix_appointments_patient_starts", "patient_id", "starts_at"),
    )

    patient_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("patients.id"))
    doctor_user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"))
    specialty: Mapped[str] = mapped_column(String(20), index=True)
    room_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("rooms.id"), default=None)
    appointment_type_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("appointment_types.id"), default=None
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(12), index=True)
    admin_notes: Mapped[str | None] = mapped_column(String(500), default=None)
    cancel_reason: Mapped[str | None] = mapped_column(String(200), default=None)
    # Sesiones de un mismo paquete (acupuntura, quiropraxia, sueroterapia…).
    series_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, index=True, default=None)
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), default=None)

    # Se cargan junto a la cita para mostrar nombres sin consultas extra (ni cargas perezosas).
    patient: Mapped[Patient] = relationship("Patient", lazy="selectin", viewonly=True)
    doctor: Mapped[User] = relationship(
        "User", foreign_keys=[doctor_user_id], lazy="selectin", viewonly=True
    )
    room: Mapped[Room | None] = relationship("Room", lazy="selectin", viewonly=True)
    appointment_type: Mapped[AppointmentType | None] = relationship(
        "AppointmentType", lazy="selectin", viewonly=True
    )

    @property
    def patient_name(self) -> str:
        return self.patient.full_name

    @property
    def patient_phone(self) -> str | None:
        return self.patient.phone

    @property
    def doctor_name(self) -> str:
        return self.doctor.full_name

    @property
    def room_name(self) -> str | None:
        return self.room.name if self.room else None

    @property
    def type_name(self) -> str | None:
        return self.appointment_type.name if self.appointment_type else None


__all__ = [
    "Appointment",
    "AppointmentType",
    "DoctorSchedule",
    "Room",
    "ScheduleException",
]
