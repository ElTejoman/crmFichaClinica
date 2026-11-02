"""Pacientes, historia clínica (cabecera) y relación terapéutica."""

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Sequence,
    String,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin, UuidPrimaryKeyMixin


class Patient(UuidPrimaryKeyMixin, TimestampMixin, Base):
    """Datos administrativos del paciente. Nunca se borra: se archiva (`is_active`).

    Contiene datos personales de salud (Ley 29733): su lectura se audita. El contenido
    clínico NO vive aquí sino en la historia clínica / encuentros (Fase 4).
    """

    __tablename__ = "patients"
    __table_args__ = (
        UniqueConstraint("document_type", "document_number", name="uq_patients_document"),
        # Índice trigram: acelera la búsqueda por nombre tolerante a errores (pg_trgm).
        Index(
            "ix_patients_full_name_trgm",
            text("f_unaccent(lower(first_name || ' ' || last_name)) gin_trgm_ops"),
            postgresql_using="gin",
        ),
    )

    document_type: Mapped[str] = mapped_column(String(10))
    document_number: Mapped[str] = mapped_column(String(20))
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    birth_date: Mapped[date] = mapped_column(Date)
    sex: Mapped[str] = mapped_column(String(10))
    marital_status: Mapped[str | None] = mapped_column(String(12), default=None)
    occupation: Mapped[str | None] = mapped_column(String(120), default=None)
    address: Mapped[str | None] = mapped_column(String(250), default=None)
    district: Mapped[str | None] = mapped_column(String(80), default=None)
    phone: Mapped[str | None] = mapped_column(String(20), index=True, default=None)
    email: Mapped[str | None] = mapped_column(String(320), index=True, default=None)
    insurance: Mapped[str | None] = mapped_column(String(120), default=None)
    referral_source: Mapped[str | None] = mapped_column(String(12), default=None)

    emergency_contact_name: Mapped[str | None] = mapped_column(String(150), default=None)
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(20), default=None)
    emergency_contact_relation: Mapped[str | None] = mapped_column(String(50), default=None)

    # Apoderado: obligatorio si el paciente es menor de 18 años (regla en el servicio).
    guardian_name: Mapped[str | None] = mapped_column(String(150), default=None)
    guardian_document_type: Mapped[str | None] = mapped_column(String(10), default=None)
    guardian_document_number: Mapped[str | None] = mapped_column(String(20), default=None)
    guardian_phone: Mapped[str | None] = mapped_column(String(20), default=None)
    guardian_relation: Mapped[str | None] = mapped_column(String(50), default=None)

    # Consentimiento de tratamiento de datos (Ley 29733): sin él no se abre la historia.
    data_processing_consent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), default=None)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    clinical_history: Mapped["ClinicalHistory | None"] = relationship(
        back_populates="patient", lazy="selectin", uselist=False
    )

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"

    @property
    def hc_number(self) -> int | None:
        return self.clinical_history.hc_number if self.clinical_history else None

    @property
    def emergency_contact(self) -> dict[str, Any] | None:
        if not self.emergency_contact_name:
            return None
        return {
            "name": self.emergency_contact_name,
            "phone": self.emergency_contact_phone,
            "relation": self.emergency_contact_relation,
        }

    @property
    def guardian(self) -> dict[str, Any] | None:
        if not self.guardian_name:
            return None
        return {
            "name": self.guardian_name,
            "document_type": self.guardian_document_type,
            "document_number": self.guardian_document_number,
            "phone": self.guardian_phone,
            "relation": self.guardian_relation,
        }


class ClinicalHistory(Base):
    """Cabecera de la historia clínica: una por paciente (ADR-001, NTS 139 [VERIFICAR])."""

    __tablename__ = "clinical_histories"

    patient_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("patients.id"), primary_key=True)
    # Correlativo único generado por la BD (no por la app) para que no haya huecos ni duplicados
    # bajo concurrencia.
    hc_number: Mapped[int] = mapped_column(
        BigInteger,
        Sequence("hc_number_seq"),
        unique=True,
        server_default=text("nextval('hc_number_seq')"),
    )
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # Fecha hasta la que debe conservarse (RETENTION_YEARS, parámetro **[VERIFICAR]**).
    retention_until: Mapped[date] = mapped_column(Date)

    patient: Mapped[Patient] = relationship(back_populates="clinical_history")


class CareTeamMember(UuidPrimaryKeyMixin, Base):
    """Relación terapéutica doctor↔paciente: habilita al doctor a ver a su paciente."""

    __tablename__ = "care_team"
    __table_args__ = (
        # Un doctor solo puede estar activo una vez por paciente.
        Index(
            "uq_care_team_active",
            "patient_id",
            "doctor_user_id",
            unique=True,
            postgresql_where=text("until IS NULL"),
        ),
    )

    patient_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("patients.id"), index=True)
    doctor_user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    since: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), default=None)
