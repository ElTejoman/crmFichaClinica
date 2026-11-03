"""Modelos SQLAlchemy. Cada módulo de modelo debe importarse aquí para que Alembic lo detecte."""

from app.models.agenda import Appointment, AppointmentType, DoctorSchedule, Room, ScheduleException
from app.models.audit_log import AuditLog
from app.models.clinical import (
    Addendum,
    Allergy,
    Attachment,
    Condition,
    Consent,
    ConsentTemplate,
    Encounter,
    EncounterDiagnosis,
    Icd10Code,
    Medication,
    SpecialtyPayload,
    VitalSigns,
)
from app.models.lead import Lead, LeadActivity
from app.models.patient import CareTeamMember, ClinicalHistory, Patient
from app.models.user import DoctorProfile, DoctorSpecialty, RefreshToken, User, UserRole

__all__ = [
    "Addendum",
    "Allergy",
    "Appointment",
    "AppointmentType",
    "Attachment",
    "AuditLog",
    "CareTeamMember",
    "ClinicalHistory",
    "Condition",
    "Consent",
    "ConsentTemplate",
    "DoctorProfile",
    "DoctorSchedule",
    "DoctorSpecialty",
    "Encounter",
    "EncounterDiagnosis",
    "Icd10Code",
    "Lead",
    "LeadActivity",
    "Medication",
    "Patient",
    "RefreshToken",
    "Room",
    "ScheduleException",
    "SpecialtyPayload",
    "User",
    "UserRole",
    "VitalSigns",
]
