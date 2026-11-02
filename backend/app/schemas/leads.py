"""DTOs del CRM de posibles clientes."""

import uuid
from datetime import datetime
from typing import Self

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.domain.enums import LeadActivityType, LeadSource, LeadStatus, Specialty
from app.schemas.patients import PatientCreate
from app.schemas.types import LongText, NormalizedPhone, ShortText


def _require_aware(value: datetime | None) -> datetime | None:
    """Evita ambigüedades horarias: las fechas deben traer zona (el front envía ISO con offset)."""
    if value is not None and value.tzinfo is None:
        raise ValueError("La fecha debe incluir zona horaria")
    return value


class LeadCreate(BaseModel):
    full_name: ShortText
    phone: NormalizedPhone | None = None
    email: EmailStr | None = None
    interest_specialties: set[Specialty] = Field(default_factory=set)
    source: LeadSource
    consent_marketing: bool = False
    assigned_to: uuid.UUID | None = None
    notes: LongText | None = None

    @model_validator(mode="after")
    def needs_a_contact_channel(self) -> Self:
        if not self.phone and not self.email:
            raise ValueError("Indique al menos un teléfono o un correo de contacto")
        return self

    @field_validator("email")
    @classmethod
    def lowercase_email(cls, value: str | None) -> str | None:
        return value.lower() if value else value


class LeadUpdate(BaseModel):
    """Parcial: se aplican los campos enviados (incluso `null` para vaciar)."""

    full_name: ShortText | None = None
    phone: NormalizedPhone | None = None
    email: EmailStr | None = None
    interest_specialties: set[Specialty] | None = None
    source: LeadSource | None = None
    status: LeadStatus | None = None
    lost_reason: str | None = Field(default=None, max_length=200)
    consent_marketing: bool | None = None
    assigned_to: uuid.UUID | None = None
    notes: LongText | None = None

    @field_validator("email")
    @classmethod
    def lowercase_email(cls, value: str | None) -> str | None:
        return value.lower() if value else value


class LeadActivityCreate(BaseModel):
    type: LeadActivityType
    notes: str | None = Field(default=None, max_length=1000)
    next_action_at: datetime | None = None

    @field_validator("type")
    @classmethod
    def not_system_type(cls, value: LeadActivityType) -> LeadActivityType:
        if value == LeadActivityType.STATUS_CHANGE:
            raise ValueError("Los cambios de estado los registra el sistema")
        return value

    _aware = field_validator("next_action_at")(_require_aware)


class LeadActivityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: LeadActivityType
    notes: str | None
    next_action_at: datetime | None
    created_by: uuid.UUID | None
    created_at: datetime


class LeadSummary(BaseModel):
    """Tarjeta del Kanban / fila de lista (sin historial de actividades)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    phone: str | None
    email: EmailStr | None
    interest_specialties: list[Specialty]
    source: LeadSource
    status: LeadStatus
    status_changed_at: datetime
    next_action_at: datetime | None
    assigned_to: uuid.UUID | None
    assigned_to_name: str | None
    consent_marketing: bool
    converted_patient_id: uuid.UUID | None
    # Motivo de pérdida: la pestaña "Perdidos" del tablero lo muestra sin pedir cada detalle.
    lost_reason: str | None
    updated_at: datetime


class LeadRead(LeadSummary):
    notes: str | None
    created_at: datetime
    activities: list[LeadActivityRead]


class LeadConvert(BaseModel):
    """Datos del paciente que se crea al convertir (el front los pre-rellena desde el lead)."""

    patient: PatientCreate


class LeadConversionResult(BaseModel):
    lead: LeadRead
    patient_id: uuid.UUID
    hc_number: int | None


class DuplicateLeadInfo(BaseModel):
    id: uuid.UUID
    full_name: str
    status: LeadStatus


class DuplicatePatientInfo(BaseModel):
    id: uuid.UUID
    full_name: str


class LeadStats(BaseModel):
    total: int
    open: int
    converted: int
    lost: int
    # Conversión = convertidos / total de leads (0 si aún no hay leads).
    conversion_rate: float
    by_status: dict[str, int]
    by_source: dict[str, int]
    by_specialty: dict[str, int]
    lost_reasons: dict[str, int]
