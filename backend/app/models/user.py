"""Usuarios, roles, perfil profesional y tokens de refresco."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.domain.enums import Role, Specialty
from app.models.mixins import TimestampMixin, UuidPrimaryKeyMixin


class User(UuidPrimaryKeyMixin, TimestampMixin, Base):
    """Persona con acceso al sistema. Nunca se borra: se desactiva (`is_active`)."""

    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(30), default=None)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Protección contra fuerza bruta.
    failed_login_count: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    # 2FA TOTP (se activa en Fase 7). Se guardará cifrado.
    totp_secret: Mapped[str | None] = mapped_column(String(255), default=None)

    # `selectin` evita cargas perezosas, que no funcionan en SQLAlchemy async.
    roles: Mapped[list["UserRole"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )
    doctor_profile: Mapped["DoctorProfile | None"] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="selectin", uselist=False
    )

    @property
    def role_names(self) -> list[Role]:
        """Roles como enum, ordenados para respuestas estables."""
        return sorted((Role(r.role) for r in self.roles), key=lambda role: role.value)


class UserRole(Base):
    """Asignación usuario↔rol (un usuario puede tener varios)."""

    __tablename__ = "user_roles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[str] = mapped_column(String(20), primary_key=True)

    user: Mapped[User] = relationship(back_populates="roles")


class DoctorProfile(Base):
    """Datos profesionales del doctor; la colegiatura aparece en firma y sello de la ficha."""

    __tablename__ = "doctor_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    license_number: Mapped[str] = mapped_column(String(40))
    professional_body: Mapped[str] = mapped_column(String(10))
    rne: Mapped[str | None] = mapped_column(String(40), default=None)

    user: Mapped[User] = relationship(back_populates="doctor_profile")
    specialties: Mapped[list["DoctorSpecialty"]] = relationship(
        back_populates="profile", cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def specialty_names(self) -> list[Specialty]:
        return sorted((Specialty(s.specialty) for s in self.specialties), key=lambda s: s.value)


class DoctorSpecialty(Base):
    __tablename__ = "doctor_specialties"

    doctor_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("doctor_profiles.user_id", ondelete="CASCADE"), primary_key=True
    )
    specialty: Mapped[str] = mapped_column(String(20), primary_key=True)

    profile: Mapped[DoctorProfile] = relationship(back_populates="specialties")


class RefreshToken(UuidPrimaryKeyMixin, Base):
    """Refresh token opaco. Solo se guarda su hash SHA-256: si se filtra la BD no sirve.

    `family_id` agrupa los tokens encadenados por rotación; si se reutiliza uno ya
    revocado (señal de robo) se revoca toda la familia.
    """

    __tablename__ = "refresh_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    family_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    user_agent: Mapped[str | None] = mapped_column(String(300), default=None)
    ip: Mapped[str | None] = mapped_column(String(45), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
