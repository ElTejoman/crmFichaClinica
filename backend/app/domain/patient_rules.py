"""Reglas puras de pacientes: documento, edad/apoderado, teléfono.

Sin dependencias externas: se prueban con valores directos. Las reglas de formato de
documentos extranjeros están marcadas **[VERIFICAR]** (docs/01): se aflojan a propósito
para no rechazar documentos legítimos.
"""

import re
from datetime import date

from app.domain.enums import DocumentType

ADULT_AGE = 18  # Código Civil peruano: mayoría de edad. Menores requieren apoderado.
MAX_PLAUSIBLE_AGE = 120

_DNI_PATTERN = re.compile(r"^\d{8}$")
_CE_PATTERN = re.compile(r"^[A-Z0-9]{9,12}$")  # [VERIFICAR] longitud real del carné de extranjería
_PASSPORT_PATTERN = re.compile(r"^[A-Z0-9]{6,12}$")
_OTHER_PATTERN = re.compile(r"^[A-Z0-9\-]{4,20}$")
_DOCUMENT_PATTERNS: dict[DocumentType, tuple[re.Pattern[str], str]] = {
    DocumentType.DNI: (_DNI_PATTERN, "El DNI debe tener exactamente 8 dígitos"),
    DocumentType.CE: (_CE_PATTERN, "El carné de extranjería debe tener 9 a 12 caracteres"),
    DocumentType.PASSPORT: (_PASSPORT_PATTERN, "El pasaporte debe tener 6 a 12 caracteres"),
    DocumentType.OTHER: (_OTHER_PATTERN, "El documento debe tener 4 a 20 caracteres"),
}

_PERU_MOBILE = re.compile(r"^9\d{8}$")
_PERU_COUNTRY_CODE = "+51"
_MIN_PHONE_DIGITS = 6
_MAX_PHONE_DIGITS = 15  # máximo E.164


def normalize_document(document_type: DocumentType, number: str) -> str:
    """Normaliza (mayúsculas, sin espacios) y valida según el tipo. Lanza `ValueError`."""
    cleaned = re.sub(r"[\s]", "", number).upper()
    pattern, message = _DOCUMENT_PATTERNS[document_type]
    if not pattern.match(cleaned):
        raise ValueError(message)
    return cleaned


def normalize_phone(raw: str) -> str:
    """Unifica el formato para buscar duplicados y usar WhatsApp: `+51912345678`.

    Un celular peruano de 9 dígitos recibe `+51`; un número internacional con `+` se respeta.
    """
    digits = re.sub(r"\D", "", raw)
    if raw.strip().startswith("+"):
        normalized = f"+{digits}"
    elif _PERU_MOBILE.match(digits):
        normalized = f"{_PERU_COUNTRY_CODE}{digits}"
    elif digits.startswith("51") and _PERU_MOBILE.match(digits[2:]):
        normalized = f"+{digits}"
    else:
        normalized = digits  # teléfono fijo u otro formato local
    if not _MIN_PHONE_DIGITS <= len(re.sub(r"\D", "", normalized)) <= _MAX_PHONE_DIGITS:
        raise ValueError("Teléfono no válido")
    return normalized


def age_on(birth_date: date, on: date) -> int:
    """Edad cumplida en la fecha `on` (considera si ya pasó el cumpleaños)."""
    had_birthday = (on.month, on.day) >= (birth_date.month, birth_date.day)
    return on.year - birth_date.year - (0 if had_birthday else 1)


def requires_guardian(birth_date: date, on: date) -> bool:
    return age_on(birth_date, on) < ADULT_AGE


def validate_birth_date(birth_date: date, today: date) -> None:
    if birth_date > today:
        raise ValueError("La fecha de nacimiento no puede ser futura")
    if age_on(birth_date, today) > MAX_PLAUSIBLE_AGE:
        raise ValueError("La fecha de nacimiento no es plausible")


def format_hc_number(number: int) -> str:
    """Presentación del número de historia clínica: `HC-000042`."""
    return f"HC-{number:06d}"


def mask_document(number: str) -> str:
    """Oculta el documento salvo los últimos 3 caracteres (candidatos a duplicado)."""
    return "*" * max(len(number) - 3, 0) + number[-3:]


def add_years(start: date, years: int) -> date:
    """Suma años calendario; un 29 de febrero cae el 28 en años no bisiestos."""
    try:
        return start.replace(year=start.year + years)
    except ValueError:
        return start.replace(year=start.year + years, day=28)
