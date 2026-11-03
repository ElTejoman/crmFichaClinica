import pytest

from app.domain.clinical_rules import (
    ClinicalRuleError,
    SigningInput,
    calculate_bmi,
    can_add_addendum,
    can_edit,
    compute_content_hash,
    has_any_vital,
    normalize_icd10,
    required_consents_missing,
    signing_checklist,
    sniff_matches,
    validate_vitals,
    verify_content_hash,
)
from app.domain.enums import EncounterStatus as E


# ------------------------------------------------------------------- vitales
def test_plausible_vitals_are_accepted_including_abnormal_ones() -> None:
    validate_vitals({"systolic": 180, "diastolic": 110, "heart_rate": 40, "temperature_c": 39.5})
    validate_vitals({"spo2": 88, "pain_vas": 10, "weight_kg": 45.2, "height_cm": 150})


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("systolic", 400),
        ("heart_rate", 5),
        ("temperature_c", 4),  # típico error: 3.65 vs 36.5
        ("spo2", 101),
        ("pain_vas", 11),
        ("pain_vas", -1),
        ("weight_kg", 0),
        ("height_cm", 1.7),  # metros en vez de centímetros
    ],
)
def test_implausible_vitals_are_rejected(field: str, value: float) -> None:
    values: dict[str, float | None] = {field: value}
    if field in ("systolic",):
        values["diastolic"] = 80
    with pytest.raises(ClinicalRuleError, match="fuera de rango"):
        validate_vitals(values)


def test_blood_pressure_needs_both_values_and_diastolic_below_systolic() -> None:
    with pytest.raises(ClinicalRuleError, match="menor"):
        validate_vitals({"systolic": 80, "diastolic": 90})
    with pytest.raises(ClinicalRuleError, match="ambas"):
        validate_vitals({"systolic": 120})
    validate_vitals({"systolic": 120, "diastolic": 80})


def test_has_any_vital() -> None:
    assert not has_any_vital({})
    assert not has_any_vital({"heart_rate": None})
    assert has_any_vital({"pain_vas": 0})  # 0 es una medición válida, no "ausente"


@pytest.mark.parametrize(
    ("weight", "height", "expected"),
    [(70, 170, 24.2), (50, 160, 19.5), (90, 175, 29.4), (100, 100, 100.0)],
)
def test_bmi_is_computed_from_kg_and_cm(weight: float, height: float, expected: float) -> None:
    assert calculate_bmi(weight, height) == expected


@pytest.mark.parametrize(("w", "h"), [(None, 170), (70, None), (0, 170), (70, 0)])
def test_bmi_is_none_when_data_is_missing(w: float | None, h: float | None) -> None:
    assert calculate_bmi(w, h) is None


# -------------------------------------------------------------------- CIE-10
@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("m54.5", "M54.5"),
        (" M54.5 ", "M54.5"),
        ("M545", "M54.5"),
        ("K02", "K02"),
        ("k021", "K02.1"),
    ],
)
def test_icd10_is_normalized(raw: str, expected: str) -> None:
    assert normalize_icd10(raw) == expected


@pytest.mark.parametrize("raw", ["", "54.5", "MM4.5", "U07.1", "M5", "M54.55555", "hola"])
def test_invalid_icd10_is_rejected(raw: str) -> None:
    with pytest.raises(ClinicalRuleError):
        normalize_icd10(raw)


# ----------------------------------------------------------------- checklist
def _complete(**changes: object) -> SigningInput:
    base = {
        "subjective": "Dolor lumbar hace 2 semanas",
        "plan": "Reposo relativo y control en 7 días",
        "diagnosis_count": 1,
        "has_vitals": True,
        "vitals_not_applicable_reason": None,
        "history_reviewed_today": True,
        "has_general_consent": True,
    }
    base.update(changes)
    return SigningInput(**base)  # type: ignore[arg-type]


def test_a_complete_encounter_has_nothing_missing() -> None:
    assert signing_checklist(_complete()) == []


@pytest.mark.parametrize(
    ("change", "code"),
    [
        ({"subjective": None}, "chief_complaint"),
        ({"subjective": "   "}, "chief_complaint"),
        ({"diagnosis_count": 0}, "diagnosis"),
        ({"plan": ""}, "plan"),
        ({"has_vitals": False}, "vitals"),
        ({"history_reviewed_today": False}, "history_reviewed"),
        ({"has_general_consent": False}, "general_consent"),
    ],
)
def test_each_missing_requirement_is_reported_by_code(change: dict[str, object], code: str) -> None:
    assert [m.code for m in signing_checklist(_complete(**change))] == [code]


def test_vitals_can_be_replaced_by_a_reason() -> None:
    assert (
        signing_checklist(_complete(has_vitals=False, vitals_not_applicable_reason="Teleconsulta"))
        == []
    )
    blank = signing_checklist(_complete(has_vitals=False, vitals_not_applicable_reason="  "))
    assert [m.code for m in blank] == ["vitals"]


def test_everything_missing_is_listed_at_once() -> None:
    empty = SigningInput(None, None, 0, False, None, False, False)
    assert [m.code for m in signing_checklist(empty)] == [
        "chief_complaint",
        "diagnosis",
        "plan",
        "vitals",
        "history_reviewed",
        "general_consent",
    ]


# ------------------------------------------------------------------- estados
def test_only_drafts_are_editable_and_only_signed_ones_accept_addenda() -> None:
    assert can_edit(E.DRAFT) and not can_edit(E.SIGNED) and not can_edit(E.AMENDED)
    assert not can_add_addendum(E.DRAFT)
    assert can_add_addendum(E.SIGNED) and can_add_addendum(E.AMENDED)


# --------------------------------------------------------------------- hash
def test_hash_is_deterministic_independent_of_key_order_and_detects_any_change() -> None:
    content = {"subjective": "Dolor", "vitals": [{"hr": 70}], "plan": "Reposo"}
    reordered = {"plan": "Reposo", "vitals": [{"hr": 70}], "subjective": "Dolor"}
    digest = compute_content_hash(content)
    assert digest == compute_content_hash(reordered) and len(digest) == 64
    assert verify_content_hash(content, digest)
    assert not verify_content_hash({**content, "plan": "Reposo."}, digest)  # un punto basta
    assert not verify_content_hash({**content, "vitals": [{"hr": 71}]}, digest)


def test_hash_distinguishes_accents_and_survives_a_json_roundtrip() -> None:
    """Una tilde cambia el contenido clínico ("niño" vs "nino"), así que debe cambiar el hash."""
    import json

    original = {"s": "Dolor lumbar en niño — 3 semanas"}
    assert compute_content_hash(original) != compute_content_hash(
        {"s": "Dolor lumbar en nino — 3 semanas"}
    )
    # El contenido viaja por JSON/BD: el hash no debe cambiar tras serializar y volver a leer.
    assert compute_content_hash(json.loads(json.dumps(original))) == compute_content_hash(original)


# ------------------------------------------------------------------ adjuntos
@pytest.mark.parametrize(
    ("mime", "head", "ok"),
    [
        ("application/pdf", b"%PDF-1.7\n...", True),
        ("image/png", b"\x89PNG\r\n\x1a\n\x00", True),
        ("image/jpeg", b"\xff\xd8\xff\xe0", True),
        ("image/webp", b"RIFF\x00\x00\x00\x00WEBPVP8 ", True),
        ("application/pdf", b"MZ\x90\x00", False),  # un .exe renombrado
        ("image/png", b"%PDF-", False),
        ("image/webp", b"RIFF\x00\x00\x00\x00WAVEfmt ", False),  # RIFF pero es audio
        ("text/html", b"<html>", False),
    ],
)
def test_file_signature_must_match_the_declared_type(mime: str, head: bytes, ok: bool) -> None:
    assert sniff_matches(mime, head) is ok


def test_required_consents_missing() -> None:
    assert required_consents_missing(["A", "B"], ["B"]) == ["A"]
    assert required_consents_missing([], []) == []
