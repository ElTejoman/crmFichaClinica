"""Modelos SQLAlchemy. Cada módulo de modelo debe importarse aquí para que Alembic lo detecte."""

from app.models.audit_log import AuditLog
from app.models.user import DoctorProfile, DoctorSpecialty, RefreshToken, User, UserRole

__all__ = [
    "AuditLog",
    "DoctorProfile",
    "DoctorSpecialty",
    "RefreshToken",
    "User",
    "UserRole",
]
