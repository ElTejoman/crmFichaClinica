"""Núcleo clínico: antecedentes, catálogo CIE-10, consentimientos, encuentros y adjuntos.

Reglas de datos (CLAUDE.md §7): sin borrado físico, firmado = inmutable (lo refuerzan
triggers en la BD, ver migración 0005), y la auditoría la hace la capa de servicios.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin, UuidPrimaryKeyMixin
from app.models.user import User


# ------------------------------------------------------- antecedentes (longitudinal)
class Allergy(UuidPrimaryKeyMixin, TimestampMixin, Base):
    """Alergia del paciente (compartida entre especialidades; se muestra como alerta)."""

    __tablename__ = "allergies"

    patient_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("patients.id"), index=True)
    substance: Mapped[str] = mapped_column(String(120))
    reaction: Mapped[str | None] = mapped_column(String(200), default=None)
    severity: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(10), default="ACTIVE")
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), default=None)


class Medication(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "medications"

    patient_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("patients.id"), index=True)
    name: Mapped[str] = mapped_column(String(150))
    dose: Mapped[str | None] = mapped_column(String(80), default=None)
    route: Mapped[str | None] = mapped_column(String(40), default=None)
    frequency: Mapped[str | None] = mapped_column(String(80), default=None)
    since: Mapped[date | None] = mapped_column(Date, default=None)
    until: Mapped[date | None] = mapped_column(Date, default=None)
    prescriber: Mapped[str | None] = mapped_column(String(150), default=None)
    status: Mapped[str] = mapped_column(String(10), default="ACTIVE")
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), default=None)


class Condition(UuidPrimaryKeyMixin, TimestampMixin, Base):
    """Antecedente personal, familiar, quirúrgico o hábito."""

    __tablename__ = "conditions"

    patient_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("patients.id"), index=True)
    kind: Mapped[str] = mapped_column(String(10))
    icd10_code: Mapped[str | None] = mapped_column(String(10), default=None)
    description: Mapped[str] = mapped_column(String(250))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), default=None)


# ------------------------------------------------------------------- catálogos
class Icd10Code(Base):
    """Catálogo CIE-10 (referencia, no por paciente). Subconjunto de ejemplo: ver docs/01."""

    __tablename__ = "icd10_codes"
    __table_args__ = (
        Index(
            "ix_icd10_search_trgm",
            text("f_unaccent(lower(code || ' ' || description)) gin_trgm_ops"),
            postgresql_using="gin",
        ),
    )

    code: Mapped[str] = mapped_column(String(10), primary_key=True)
    description: Mapped[str] = mapped_column(String(300))


class ConsentTemplate(UuidPrimaryKeyMixin, Base):
    """Texto de consentimiento versionado. Se guarda la versión EXACTA que se firmó."""

    __tablename__ = "consent_templates"
    __table_args__ = (UniqueConstraint("type", "version", name="uq_consent_template_version"),)

    type: Mapped[str] = mapped_column(String(30))
    version: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Consent(UuidPrimaryKeyMixin, Base):
    """Consentimiento firmado. No se borra; se REVOCA (con motivo)."""

    __tablename__ = "consents"

    patient_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("patients.id"), index=True)
    type: Mapped[str] = mapped_column(String(30), index=True)
    template_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("consent_templates.id"))
    text_version: Mapped[int] = mapped_column(Integer)
    method: Mapped[str] = mapped_column(String(16))
    # Quién firmó: el paciente o, si es menor/incapaz, su apoderado (con su relación).
    signed_by_name: Mapped[str] = mapped_column(String(150))
    signer_relation: Mapped[str | None] = mapped_column(String(50), default=None)
    signature_image: Mapped[str | None] = mapped_column(Text, default=None)  # data URL PNG
    witness_name: Mapped[str | None] = mapped_column(String(150), default=None)
    signed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    captured_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id"), default=None
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    revoked_reason: Mapped[str | None] = mapped_column(String(200), default=None)
    revoked_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), default=None)

    template: Mapped[ConsentTemplate] = relationship(
        "ConsentTemplate", lazy="selectin", viewonly=True
    )

    @property
    def title(self) -> str:
        return self.template.title


# ------------------------------------------------------------------- encuentros
class Encounter(UuidPrimaryKeyMixin, TimestampMixin, Base):
    """Atención clínica (formato SOAP). Firmada = inmutable; los cambios van como adendas."""

    __tablename__ = "encounters"
    __table_args__ = (
        # Una cita genera a lo sumo un encuentro.
        Index(
            "uq_encounters_appointment",
            "appointment_id",
            unique=True,
            postgresql_where=text("appointment_id IS NOT NULL"),
        ),
        Index("ix_encounters_patient_occurred", "patient_id", "occurred_at"),
    )

    patient_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("patients.id"))
    appointment_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("appointments.id"), default=None
    )
    doctor_user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    specialty: Mapped[str] = mapped_column(String(20), index=True)
    status: Mapped[str] = mapped_column(String(10), index=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    subjective: Mapped[str | None] = mapped_column(Text, default=None)
    objective_notes: Mapped[str | None] = mapped_column(Text, default=None)
    assessment_notes: Mapped[str | None] = mapped_column(Text, default=None)
    plan: Mapped[str | None] = mapped_column(Text, default=None)
    followup_at: Mapped[date | None] = mapped_column(Date, default=None)
    # El doctor confirma que revisó alergias y medicación EN esta atención (requisito de firma).
    history_reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
    vitals_not_applicable_reason: Mapped[str | None] = mapped_column(String(200), default=None)

    signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    signed_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), default=None)
    # Se congelan al firmar: firma y sello (nombre + colegiatura) tal como estaban ese día.
    signer_name: Mapped[str | None] = mapped_column(String(200), default=None)
    signer_license: Mapped[str | None] = mapped_column(String(80), default=None)
    content_hash: Mapped[str | None] = mapped_column(String(64), default=None)

    doctor: Mapped[User] = relationship(
        "User", foreign_keys=[doctor_user_id], lazy="selectin", viewonly=True
    )
    vitals: Mapped[list["VitalSigns"]] = relationship(
        lazy="selectin", order_by="VitalSigns.measured_at", viewonly=True
    )
    diagnoses: Mapped[list["EncounterDiagnosis"]] = relationship(
        lazy="selectin",
        order_by="(EncounterDiagnosis.is_primary.desc(), EncounterDiagnosis.icd10_code)",
        viewonly=True,
    )
    addenda: Mapped[list["Addendum"]] = relationship(
        lazy="selectin", order_by="Addendum.created_at", viewonly=True
    )
    payload: Mapped["SpecialtyPayload | None"] = relationship(
        lazy="selectin", uselist=False, viewonly=True
    )

    @property
    def doctor_name(self) -> str:
        return self.doctor.full_name

    @property
    def _main_diagnosis(self) -> "EncounterDiagnosis | None":
        if not self.diagnoses:
            return None
        return next((d for d in self.diagnoses if d.is_primary), self.diagnoses[0])

    @property
    def primary_diagnosis_code(self) -> str | None:
        return self._main_diagnosis.icd10_code if self._main_diagnosis else None

    @property
    def primary_diagnosis_text(self) -> str | None:
        return self._main_diagnosis.description if self._main_diagnosis else None

    @property
    def addenda_count(self) -> int:
        return len(self.addenda)


class VitalSigns(UuidPrimaryKeyMixin, Base):
    __tablename__ = "vital_signs"

    encounter_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("encounters.id"), index=True)
    context: Mapped[str] = mapped_column(String(10))
    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    systolic: Mapped[int | None] = mapped_column(SmallInteger, default=None)
    diastolic: Mapped[int | None] = mapped_column(SmallInteger, default=None)
    heart_rate: Mapped[int | None] = mapped_column(SmallInteger, default=None)
    resp_rate: Mapped[int | None] = mapped_column(SmallInteger, default=None)
    temperature_c: Mapped[Decimal | None] = mapped_column(Numeric(4, 1), default=None)
    spo2: Mapped[int | None] = mapped_column(SmallInteger, default=None)
    weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(5, 1), default=None)
    height_cm: Mapped[Decimal | None] = mapped_column(Numeric(4, 1), default=None)
    bmi: Mapped[Decimal | None] = mapped_column(Numeric(4, 1), default=None)  # calculado
    pain_vas: Mapped[int | None] = mapped_column(SmallInteger, default=None)


class EncounterDiagnosis(UuidPrimaryKeyMixin, Base):
    __tablename__ = "encounter_diagnoses"
    __table_args__ = (
        UniqueConstraint("encounter_id", "icd10_code", name="uq_encounter_diagnosis_code"),
        # Como máximo UN diagnóstico principal por encuentro.
        Index(
            "uq_encounter_primary_diagnosis",
            "encounter_id",
            unique=True,
            postgresql_where=text("is_primary"),
        ),
    )

    encounter_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("encounters.id"), index=True)
    icd10_code: Mapped[str] = mapped_column(String(10))
    description: Mapped[str] = mapped_column(String(300))  # copia: el catálogo puede cambiar
    type: Mapped[str] = mapped_column(String(12))
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)


class Addendum(UuidPrimaryKeyMixin, Base):
    """Corrección o ampliación de un encuentro firmado. Append-only."""

    __tablename__ = "addenda"

    encounter_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("encounters.id"), index=True)
    reason: Mapped[str] = mapped_column(String(200))
    text: Mapped[str] = mapped_column(Text)
    created_by: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"))
    author_name: Mapped[str] = mapped_column(String(200))
    author_license: Mapped[str | None] = mapped_column(String(80), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SpecialtyPayload(Base):
    """Datos del módulo de la especialidad (JSONB validado por Pydantic, con versión)."""

    __tablename__ = "specialty_payloads"

    encounter_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("encounters.id"), primary_key=True
    )
    specialty: Mapped[str] = mapped_column(String(20))
    schema_version: Mapped[int] = mapped_column(Integer)
    data: Mapped[dict[str, Any]] = mapped_column(JSONB)


class Attachment(UuidPrimaryKeyMixin, Base):
    """Metadatos de un archivo clínico. El archivo vive fuera de la BD (`storage_key`)."""

    __tablename__ = "attachments"

    patient_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("patients.id"), index=True)
    encounter_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("encounters.id"), index=True, default=None
    )
    kind: Mapped[str] = mapped_column(String(14))
    original_name: Mapped[str] = mapped_column(String(200))
    mime: Mapped[str] = mapped_column(String(40))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    sha256: Mapped[str] = mapped_column(String(64))
    storage_key: Mapped[str] = mapped_column(String(80), unique=True)
    # Fotos y similares exigen el consentimiento del paciente (docs/01 §6, hueco 15).
    has_patient_consent: Mapped[bool] = mapped_column(Boolean, default=False)
    uploaded_by: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
