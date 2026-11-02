"""DTOs de usuarios."""

import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.domain.enums import ProfessionalBody, Role, Specialty


class DoctorProfileIn(BaseModel):
    license_number: str = Field(min_length=1, max_length=40, description="Nº de colegiatura")
    professional_body: ProfessionalBody
    rne: str | None = Field(default=None, max_length=40)
    specialties: set[Specialty] = Field(min_length=1)


class DoctorProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    license_number: str
    professional_body: ProfessionalBody
    rne: str | None
    specialties: list[Specialty] = Field(validation_alias="specialty_names")


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=200)
    phone: str | None = Field(default=None, max_length=30)
    password: str = Field(max_length=256)
    roles: set[Role] = Field(min_length=1)
    doctor_profile: DoctorProfileIn | None = None

    @model_validator(mode="after")
    def doctor_requires_profile(self) -> "UserCreate":
        # Un doctor sin colegiatura no podría firmar fichas (docs/01 §3.6).
        if Role.DOCTOR in self.roles and self.doctor_profile is None:
            raise ValueError("El rol DOCTOR requiere doctor_profile (colegiatura y especialidades)")
        return self


class UserUpdate(BaseModel):
    """Actualización parcial. Los campos ausentes no se tocan."""

    full_name: str | None = Field(default=None, min_length=2, max_length=200)
    phone: str | None = Field(default=None, max_length=30)
    is_active: bool | None = None
    roles: set[Role] | None = Field(default=None, min_length=1)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    full_name: str
    phone: str | None
    is_active: bool
    roles: list[Role] = Field(validation_alias="role_names")
    doctor_profile: DoctorProfileRead | None
