"""Enumeraciones del dominio. Los valores son estables: se guardan en BD y viajan por la API."""

from enum import StrEnum


class Role(StrEnum):
    """Roles del sistema (docs/04). Un usuario puede tener varios (dueño = OWNER + DOCTOR)."""

    SUPERUSER = "SUPERUSER"
    OWNER = "OWNER"
    DOCTOR = "DOCTOR"
    RECEPTION = "RECEPTION"
    PATIENT = "PATIENT"


class Specialty(StrEnum):
    """Especialidades de la clínica."""

    ACUPUNCTURE = "ACUPUNCTURE"
    NUTRITION = "NUTRITION"
    CHIROPRACTIC = "CHIROPRACTIC"
    IV_THERAPY = "IV_THERAPY"
    DENTISTRY = "DENTISTRY"


class ProfessionalBody(StrEnum):
    """Colegio/registro que respalda al profesional **[VERIFICAR]** por especialidad (docs/01)."""

    CMP = "CMP"  # Colegio Médico del Perú
    COP = "COP"  # Colegio Odontológico del Perú
    CNP = "CNP"  # Colegio de Nutricionistas del Perú
    OTHER = "OTHER"


class AuditAction(StrEnum):
    """Acciones auditables. Se incluyen las clínicas futuras para fijar el vocabulario ya."""

    LOGIN = "LOGIN"
    LOGIN_FAILED = "LOGIN_FAILED"
    LOGOUT = "LOGOUT"
    TOKEN_REFRESH = "TOKEN_REFRESH"  # noqa: S105  (nombre de acción, no un secreto)
    TOKEN_REUSE_DETECTED = "TOKEN_REUSE_DETECTED"  # noqa: S105
    PERMISSION_DENIED = "PERMISSION_DENIED"
    USER_CREATE = "USER_CREATE"
    USER_UPDATE = "USER_UPDATE"
    READ = "READ"
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    SIGN = "SIGN"
    AMEND = "AMEND"
    EXPORT = "EXPORT"
    PRINT = "PRINT"
    BREAK_GLASS = "BREAK_GLASS"


class AuditOutcome(StrEnum):
    SUCCESS = "SUCCESS"
    DENIED = "DENIED"
    FAILURE = "FAILURE"


class DocumentType(StrEnum):
    DNI = "DNI"
    CE = "CE"  # Carné de extranjería
    PASSPORT = "PASSPORT"
    OTHER = "OTHER"


class Sex(StrEnum):
    FEMALE = "FEMALE"
    MALE = "MALE"
    OTHER = "OTHER"


class MaritalStatus(StrEnum):
    SINGLE = "SINGLE"
    MARRIED = "MARRIED"
    COHABITING = "COHABITING"
    DIVORCED = "DIVORCED"
    WIDOWED = "WIDOWED"


class LeadSource(StrEnum):
    WEB = "WEB"
    REFERRAL = "REFERRAL"
    INSTAGRAM = "INSTAGRAM"
    FACEBOOK = "FACEBOOK"
    WALK_IN = "WALK_IN"
    OTHER = "OTHER"


class LeadStatus(StrEnum):
    """Embudo del CRM (docs/07 §1)."""

    NEW = "NEW"
    CONTACTED = "CONTACTED"
    QUALIFIED = "QUALIFIED"
    APPOINTMENT_SET = "APPOINTMENT_SET"
    CONVERTED = "CONVERTED"
    LOST = "LOST"


class LeadActivityType(StrEnum):
    CALL = "CALL"
    WHATSAPP = "WHATSAPP"
    EMAIL = "EMAIL"
    NOTE = "NOTE"
    STATUS_CHANGE = "STATUS_CHANGE"


class AppointmentStatus(StrEnum):
    """Ciclo de vida de una cita (docs/07 §2)."""

    SCHEDULED = "SCHEDULED"
    CONFIRMED = "CONFIRMED"
    CHECKED_IN = "CHECKED_IN"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    NO_SHOW = "NO_SHOW"
    CANCELLED = "CANCELLED"
