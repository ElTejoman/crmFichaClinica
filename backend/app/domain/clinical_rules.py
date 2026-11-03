"""Reglas puras del núcleo clínico: signos vitales, CIE-10, checklist de firma y hash.

Dominio puro (sin FastAPI ni SQL). Es la fuente única de verdad de "qué falta para firmar":
el backend la usa para bloquear la firma y el frontend solo muestra lo que el backend devuelve.
Los rangos fisiológicos son **de seguridad de datos** (detectan errores de tipeo), no criterios
diagnósticos: un valor fuera de rango plausible se rechaza, uno anormal pero posible se acepta.
"""

import hashlib
import json
import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any

from app.domain.enums import EncounterStatus


class ClinicalRuleError(ValueError):
    """Una regla clínica impide la operación (el mensaje es apto para mostrar)."""


# ------------------------------------------------------------------ vitales
@dataclass(frozen=True)
class Range:
    low: float
    high: float
    label: str


# Rangos de PLAUSIBILIDAD (errores de tipeo), no de normalidad.
VITAL_RANGES: dict[str, Range] = {
    "systolic": Range(50, 260, "Presión sistólica"),
    "diastolic": Range(30, 160, "Presión diastólica"),
    "heart_rate": Range(20, 250, "Frecuencia cardiaca"),
    "resp_rate": Range(4, 70, "Frecuencia respiratoria"),
    "temperature_c": Range(30, 45, "Temperatura"),
    "spo2": Range(50, 100, "Saturación de oxígeno"),
    "weight_kg": Range(0.5, 500, "Peso"),
    "height_cm": Range(30, 250, "Talla"),
    "pain_vas": Range(0, 10, "Dolor (EVA)"),
}


def validate_vitals(values: Mapping[str, float | int | None]) -> None:
    """Valida cada medición presente y la coherencia sistólica/diastólica."""
    for key, value in values.items():
        if value is None or key not in VITAL_RANGES:
            continue
        limits = VITAL_RANGES[key]
        if not limits.low <= value <= limits.high:
            raise ClinicalRuleError(
                f"{limits.label} fuera de rango plausible ({limits.low:g} a {limits.high:g})"
            )
    systolic, diastolic = values.get("systolic"), values.get("diastolic")
    if systolic is not None and diastolic is not None and diastolic >= systolic:
        raise ClinicalRuleError("La presión diastólica debe ser menor que la sistólica")
    if (systolic is None) != (diastolic is None):
        raise ClinicalRuleError("Registre ambas presiones (sistólica y diastólica) o ninguna")


def has_any_vital(values: Mapping[str, float | int | None]) -> bool:
    return any(values.get(k) is not None for k in VITAL_RANGES)


def calculate_bmi(weight_kg: float | None, height_cm: float | None) -> float | None:
    """IMC = kg / m². Se calcula en el SERVIDOR: nunca se confía en el valor del cliente."""
    if not weight_kg or not height_cm:
        return None
    meters = height_cm / 100
    return round(weight_kg / (meters * meters), 1)


# -------------------------------------------------------------------- CIE-10
# Formato CIE-10: letra (sin U) + 2 dígitos [+ punto + 1-4 alfanuméricos]. Ej.: M54.5, K02.1.
_ICD10_PATTERN = re.compile(r"^[A-TV-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$")


def normalize_icd10(code: str) -> str:
    cleaned = code.strip().upper().replace(" ", "")
    if len(cleaned) > 3 and "." not in cleaned:
        cleaned = f"{cleaned[:3]}.{cleaned[3:]}"  # "M545" -> "M54.5"
    if not _ICD10_PATTERN.match(cleaned):
        raise ClinicalRuleError(f"Código CIE-10 no válido: {code!r}")
    return cleaned


# --------------------------------------------------------- checklist de firma
@dataclass(frozen=True)
class SigningInput:
    """Lo mínimo del encuentro que las reglas necesitan (sin depender del modelo ORM)."""

    subjective: str | None
    plan: str | None
    diagnosis_count: int
    has_vitals: bool
    vitals_not_applicable_reason: str | None
    history_reviewed_today: bool
    has_general_consent: bool


@dataclass(frozen=True)
class MissingItem:
    code: str
    message: str


def signing_checklist(data: SigningInput) -> list[MissingItem]:
    """Lista de lo que falta para firmar (vacía = se puede firmar)."""
    missing: list[MissingItem] = []
    if not (data.subjective and data.subjective.strip()):
        missing.append(MissingItem("chief_complaint", "Falta el motivo de consulta (S)"))
    if data.diagnosis_count < 1:
        missing.append(MissingItem("diagnosis", "Falta al menos un diagnóstico CIE-10 (A)"))
    if not (data.plan and data.plan.strip()):
        missing.append(MissingItem("plan", "Falta el plan de tratamiento (P)"))
    reason = (data.vitals_not_applicable_reason or "").strip()
    if not data.has_vitals and not reason:
        missing.append(
            MissingItem(
                "vitals", "Registre signos vitales o indique por qué no aplican en esta atención"
            )
        )
    if not data.history_reviewed_today:
        missing.append(
            MissingItem(
                "history_reviewed",
                "Confirme que revisó alergias y medicación del paciente en esta atención",
            )
        )
    if not data.has_general_consent:
        missing.append(
            MissingItem("general_consent", "El paciente no tiene un consentimiento general vigente")
        )
    return missing


# ------------------------------------------------------------------ estados
def can_edit(status: EncounterStatus) -> bool:
    """Solo un borrador se edita. Firmado/enmendado es inmutable."""
    return status == EncounterStatus.DRAFT


def can_add_addendum(status: EncounterStatus) -> bool:
    return status in (EncounterStatus.SIGNED, EncounterStatus.AMENDED)


# ------------------------------------------------------------------- hash
def canonical_json(content: Mapping[str, Any]) -> str:
    return json.dumps(
        content, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str
    )


def compute_content_hash(content: Mapping[str, Any]) -> str:
    """SHA-256 del contenido canónico: permite demostrar que un encuentro firmado no se alteró."""
    return hashlib.sha256(canonical_json(content).encode()).hexdigest()


def verify_content_hash(content: Mapping[str, Any], expected: str) -> bool:
    return compute_content_hash(content) == expected


# ----------------------------------------------------------------- adjuntos
ALLOWED_MIME_TYPES = frozenset({"application/pdf", "image/png", "image/jpeg", "image/webp"})
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024  # 10 MB

_SIGNATURES: dict[str, tuple[bytes, ...]] = {
    "application/pdf": (b"%PDF-",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/jpeg": (b"\xff\xd8\xff",),
}


def sniff_matches(mime: str, head: bytes) -> bool:
    """¿Los primeros bytes corresponden al tipo declarado? Evita subir un ejecutable renombrado."""
    if mime == "image/webp":
        return head[:4] == b"RIFF" and head[8:12] == b"WEBP"
    return any(head.startswith(sig) for sig in _SIGNATURES.get(mime, ()))


def required_consents_missing(required: Iterable[str], valid: Iterable[str]) -> list[str]:
    have = set(valid)
    return sorted(r for r in required if r not in have)
