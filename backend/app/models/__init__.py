"""Modelos SQLAlchemy. Cada módulo de modelo debe importarse aquí para que Alembic lo detecte."""

from app.models.agenda import Appointment, AppointmentType, DoctorSchedule, Room, ScheduleException
from app.models.audit_log import AuditLog
from app.models.lead import Lead, LeadActivity
from app.models.patient import CareTeamMember, ClinicalHistory, Patient
from app.models.user import DoctorProfile, DoctorSpecialty, RefreshToken, User, UserRole

__all__ = [
    "Appointment",
    "AppointmentType",
    "AuditLog",
    "CareTeamMember",
    "ClinicalHistory",
    "DoctorProfile",
    "DoctorSchedule",
    "DoctorSpecialty",
    "Lead",
    "LeadActivity",
    "Patient",
    "RefreshToken",
    "Room",
    "ScheduleException",
    "User",
    "UserRole",
]
