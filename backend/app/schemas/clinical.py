"""DTOs del núcleo clínico: antecedentes, CIE-10, encuentros, consentimientos y adjuntos."""

import uuid
from datetime import date, datetime
from typing import Annotated, Any, Self

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    computed_field,
    field_validator,
    model_validator,
)

from app.domain.enums import (
    AllergySeverity,
    AttachmentKind,
    ConditionKind,
    ConsentMethod,
    ConsentType,
    DiagnosisType,
    EncounterStatus,
    RecordStatus,
    Specialty,
    VitalContext,
)

# Texto clínico: sin límite de línea pero acotado para evitar abusos de almacenamiento.
ClinicalText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=10_000)]
ShortLabel = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=150)]


# ===================================================== antecedentes (alergias, etc.)
class AllergyCreate(BaseModel):
    substance: ShortLabel
    reaction: str | None = Field(default=None, max_length=200)
    severity: AllergySeverity
    verified: bool = False


class AllergyUpdate(BaseModel):
    reaction: str | None = Field(default=None, max_length=200)
    severity: AllergySeverity | None = None
    status: RecordStatus | None = None
    verified: bool | None = None


class AllergyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    substance: str
    reaction: str | None
    severity: AllergySeverity
    status: RecordStatus
    verified_at: datetime | None


class MedicationCreate(BaseModel):
    name: ShortLabel
    dose: str | None = Field(default=None, max_length=80)
    route: str | None = Field(default=None, max_length=40)
    frequency: str | None = Field(default=None, max_length=80)
    since: date | None = None
    until: date | None = None
    prescriber: str | None = Field(default=None, max_length=150)

    @model_validator(mode="after")
    def until_after_since(self) -> Self:
        if self.since and self.until and self.until < self.since:
            raise ValueError("La fecha de fin no puede ser anterior a la de inicio")
        return self


class MedicationUpdate(BaseModel):
    dose: str | None = Field(default=None, max_length=80)
    route: str | None = Field(default=None, max_length=40)
    frequency: str | None = Field(default=None, max_length=80)
    until: date | None = None
    status: RecordStatus | None = None


class MedicationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    dose: str | None
    route: str | None
    frequency: str | None
    since: date | None
    until: date | None
    prescriber: str | None
    status: RecordStatus


class ConditionCreate(BaseModel):
    kind: ConditionKind
    icd10_code: str | None = Field(default=None, max_length=10)
    description: ShortLabel


class ConditionUpdate(BaseModel):
    description: ShortLabel | None = None
    active: bool | None = None


class ConditionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: ConditionKind
    icd10_code: str | None
    description: str
    active: bool


class Icd10Read(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    description: str


# ======================================================================= encuentros
class VitalSignsIn(BaseModel):
    """Una medición. Los rangos de plausibilidad los valida el dominio (mensajes claros)."""

    context: VitalContext = VitalContext.SINGLE
    measured_at: AwareDatetime | None = None
    systolic: int | None = None
    diastolic: int | None = None
    heart_rate: int | None = None
    resp_rate: int | None = None
    temperature_c: float | None = None
    spo2: int | None = None
    weight_kg: float | None = None
    height_cm: float | None = None
    pain_vas: int | None = None
    # NO existe `bmi` de entrada: el IMC se calcula siempre en el servidor.


class VitalSignsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    context: VitalContext
    measured_at: datetime
    systolic: int | None
    diastolic: int | None
    heart_rate: int | None
    resp_rate: int | None
    temperature_c: float | None
    spo2: int | None
    weight_kg: float | None
    height_cm: float | None
    bmi: float | None
    pain_vas: int | None


class DiagnosisIn(BaseModel):
    icd10_code: str = Field(min_length=3, max_length=10)
    # Obligatoria solo si el código no está en el catálogo cargado.
    description: str | None = Field(default=None, max_length=300)
    type: DiagnosisType = DiagnosisType.DEFINITIVE
    is_primary: bool = False


class DiagnosisRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    icd10_code: str
    description: str
    type: DiagnosisType
    is_primary: bool


class EncounterCreate(BaseModel):
    """Desde una cita (`appointment_id`) o directo (`patient_id` + `specialty`)."""

    appointment_id: uuid.UUID | None = None
    patient_id: uuid.UUID | None = None
    specialty: Specialty | None = None

    @model_validator(mode="after")
    def source_is_consistent(self) -> Self:
        if self.appointment_id is None and not (self.patient_id and self.specialty):
            raise ValueError("Indique una cita o bien paciente y especialidad")
        return self


class EncounterUpdate(BaseModel):
    """Parcial: solo se aplican los campos enviados (también `null` para vaciar)."""

    subjective: ClinicalText | None = None
    objective_notes: ClinicalText | None = None
    assessment_notes: ClinicalText | None = None
    plan: ClinicalText | None = None
    followup_at: date | None = None
    vitals_not_applicable_reason: str | None = Field(default=None, max_length=200)
    # true = "revisé alergias y medicación en esta atención"; false lo retira.
    history_reviewed: bool | None = None
    vitals: list[VitalSignsIn] | None = Field(default=None, max_length=20)
    diagnoses: list[DiagnosisIn] | None = Field(default=None, max_length=20)


class AddendumCreate(BaseModel):
    reason: str = Field(min_length=1, max_length=200)
    text: str = Field(min_length=1, max_length=5_000)


class AddendumRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    reason: str
    text: str
    author_name: str
    author_license: str | None
    created_at: datetime


class PayloadWrite(BaseModel):
    data: dict[str, Any]


class PayloadRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    specialty: Specialty
    schema_version: int
    data: dict[str, Any]


class EncounterRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    patient_id: uuid.UUID
    appointment_id: uuid.UUID | None
    doctor_user_id: uuid.UUID
    doctor_name: str
    specialty: Specialty
    status: EncounterStatus
    occurred_at: datetime
    subjective: str | None
    objective_notes: str | None
    assessment_notes: str | None
    plan: str | None
    followup_at: date | None
    history_reviewed_at: datetime | None
    vitals_not_applicable_reason: str | None
    vitals: list[VitalSignsRead]
    diagnoses: list[DiagnosisRead]
    addenda: list[AddendumRead]
    payload: PayloadRead | None
    signed_at: datetime | None
    signer_name: str | None
    signer_license: str | None
    created_at: datetime


class EncounterSummary(BaseModel):
    """Fila de la línea de tiempo."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    specialty: Specialty
    status: EncounterStatus
    occurred_at: datetime
    doctor_name: str
    signed_at: datetime | None
    primary_diagnosis_code: str | None
    primary_diagnosis_text: str | None
    addenda_count: int


class MissingItemRead(BaseModel):
    code: str
    message: str


class SigningChecklist(BaseModel):
    can_sign: bool
    missing: list[MissingItemRead]


class IntegrityResult(BaseModel):
    valid: bool
    signed_at: datetime | None
    algorithm: str = "SHA-256"


# ================================================================== consentimientos
class ConsentTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: ConsentType
    version: int
    title: str
    body: str


_PNG_PREFIX = "data:image/png;base64,"


class ConsentCreate(BaseModel):
    type: ConsentType
    method: ConsentMethod
    signed_by_name: ShortLabel
    # Relación con el paciente si firma un tercero (apoderado). Obligatoria en menores.
    signer_relation: str | None = Field(default=None, max_length=50)
    signature_image: str | None = Field(default=None, max_length=400_000)
    witness_name: str | None = Field(default=None, max_length=150)

    @field_validator("signature_image")
    @classmethod
    def must_be_png_data_url(cls, value: str | None) -> str | None:
        if value is not None and not value.startswith(_PNG_PREFIX):
            raise ValueError("La firma debe ser una imagen PNG (data URL base64)")
        return value


class ConsentRead(BaseModel):
    """No incluye la imagen de la firma (se pide aparte, solo con acceso clínico)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: ConsentType
    title: str
    text_version: int
    method: ConsentMethod
    signed_by_name: str
    signer_relation: str | None
    witness_name: str | None
    signed_at: datetime
    revoked_at: datetime | None
    revoked_reason: str | None
    signature_image: str | None = Field(default=None, exclude=True)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_valid(self) -> bool:
        return self.revoked_at is None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def has_signature_image(self) -> bool:
        return self.signature_image is not None


class RevokeBody(BaseModel):
    reason: str = Field(min_length=1, max_length=200)


class SignatureImage(BaseModel):
    image: str


# ======================================================================== adjuntos
class AttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    patient_id: uuid.UUID
    encounter_id: uuid.UUID | None
    kind: AttachmentKind
    original_name: str
    mime: str
    size_bytes: int
    sha256: str
    has_patient_consent: bool
    created_at: datetime


# ================================================================ resumen clínico
class ConsentStatus(BaseModel):
    general_care: bool
    data_processing: bool


class ClinicalSummary(BaseModel):
    """Lo que el doctor ve siempre al abrir la ficha (alertas primero)."""

    allergies: list[AllergyRead]
    medications: list[MedicationRead]
    conditions: list[ConditionRead]
    last_vitals: VitalSignsRead | None
    last_encounter_at: datetime | None
    signed_encounters: int
    consents: ConsentStatus
