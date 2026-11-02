"""DTOs de pacientes y relación terapéutica."""

import uuid
from datetime import date, datetime
from typing import Self

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    computed_field,
    field_validator,
    model_validator,
)

from app.core.clock import lima_today
from app.domain.enums import DocumentType, LeadSource, MaritalStatus, Sex, Specialty
from app.domain.patient_rules import age_on, format_hc_number, normalize_document, requires_guardian
from app.schemas.types import NormalizedPhone, PersonName, ShortText


class EmergencyContact(BaseModel):
    name: ShortText
    phone: NormalizedPhone
    relation: str | None = Field(default=None, max_length=50)


class Guardian(BaseModel):
    """Apoderado (obligatorio si el paciente es menor de 18 años)."""

    name: ShortText
    document_type: DocumentType
    document_number: str
    phone: NormalizedPhone
    relation: str = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def normalize_guardian_document(self) -> Self:
        self.document_number = normalize_document(self.document_type, self.document_number)
        return self


class PatientCreate(BaseModel):
    document_type: DocumentType
    document_number: str
    first_name: PersonName
    last_name: PersonName
    birth_date: date
    sex: Sex
    marital_status: MaritalStatus | None = None
    occupation: str | None = Field(default=None, max_length=120)
    address: str | None = Field(default=None, max_length=250)
    district: str | None = Field(default=None, max_length=80)
    phone: NormalizedPhone | None = None
    email: EmailStr | None = None
    insurance: str | None = Field(default=None, max_length=120)
    referral_source: LeadSource | None = None
    emergency_contact: EmergencyContact | None = None
    guardian: Guardian | None = None
    # Ley 29733: sin consentimiento de tratamiento de datos no se abre la historia clínica.
    data_processing_consent: bool

    @field_validator("data_processing_consent")
    @classmethod
    def consent_must_be_given(cls, value: bool) -> bool:
        if not value:
            raise ValueError("Se requiere el consentimiento de tratamiento de datos personales")
        return value

    @field_validator("email")
    @classmethod
    def lowercase_email(cls, value: str | None) -> str | None:
        return value.lower() if value else value

    @model_validator(mode="after")
    def normalize_document_number(self) -> Self:
        self.document_number = normalize_document(self.document_type, self.document_number)
        return self


class PatientUpdate(BaseModel):
    """Actualización parcial. Los campos enviados (incluso `null`) se aplican; los ausentes no.

    El documento de identidad NO es editable aquí: corregirlo es una operación excepcional.
    """

    first_name: PersonName | None = None
    last_name: PersonName | None = None
    birth_date: date | None = None
    sex: Sex | None = None
    marital_status: MaritalStatus | None = None
    occupation: str | None = Field(default=None, max_length=120)
    address: str | None = Field(default=None, max_length=250)
    district: str | None = Field(default=None, max_length=80)
    phone: NormalizedPhone | None = None
    email: EmailStr | None = None
    insurance: str | None = Field(default=None, max_length=120)
    referral_source: LeadSource | None = None
    emergency_contact: EmergencyContact | None = None
    guardian: Guardian | None = None
    is_active: bool | None = None


class PatientRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    document_type: DocumentType
    document_number: str
    first_name: str
    last_name: str
    full_name: str
    birth_date: date
    sex: Sex
    marital_status: MaritalStatus | None
    occupation: str | None
    address: str | None
    district: str | None
    phone: str | None
    email: EmailStr | None
    insurance: str | None
    referral_source: LeadSource | None
    emergency_contact: EmergencyContact | None
    guardian: Guardian | None
    hc_number: int | None
    data_processing_consent_at: datetime
    is_active: bool
    created_at: datetime

    @computed_field  # type: ignore[prop-decorator]  # patrón documentado de pydantic
    @property
    def hc_code(self) -> str | None:
        return format_hc_number(self.hc_number) if self.hc_number is not None else None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def age(self) -> int:
        return age_on(self.birth_date, lima_today())

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_minor(self) -> bool:
        return requires_guardian(self.birth_date, lima_today())


class PatientSummary(BaseModel):
    """Fila de listados y búsquedas: lo mínimo necesario (principio de minimización)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    document_type: DocumentType
    document_number: str
    birth_date: date
    phone: str | None
    hc_number: int | None
    is_active: bool

    @computed_field  # type: ignore[prop-decorator]
    @property
    def hc_code(self) -> str | None:
        return format_hc_number(self.hc_number) if self.hc_number is not None else None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def age(self) -> int:
        return age_on(self.birth_date, lima_today())


class DuplicateCandidate(BaseModel):
    """Posible duplicado: el documento se muestra enmascarado."""

    patient_id: uuid.UUID
    full_name: str
    birth_date: date
    document_type: DocumentType
    document_number_masked: str
    name_similarity: float
    reasons: list[str]


class CareTeamAssign(BaseModel):
    doctor_user_id: uuid.UUID


class CareTeamRead(BaseModel):
    id: uuid.UUID
    doctor_user_id: uuid.UUID
    doctor_name: str
    since: datetime
    until: datetime | None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_active(self) -> bool:
        return self.until is None


class DoctorSummary(BaseModel):
    """Directorio de doctores (para asignar pacientes y leads)."""

    id: uuid.UUID
    full_name: str
    specialties: list[Specialty]
