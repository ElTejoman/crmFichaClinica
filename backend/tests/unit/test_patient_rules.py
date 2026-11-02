from datetime import date

import pytest

from app.domain.enums import DocumentType
from app.domain.patient_rules import (
    age_on,
    format_hc_number,
    mask_document,
    normalize_document,
    normalize_phone,
    requires_guardian,
    validate_birth_date,
)

TODAY = date(2026, 11, 2)


@pytest.mark.parametrize(
    ("birth", "expected"),
    [
        (date(2008, 11, 2), 18),  # cumple hoy
        (date(2008, 11, 3), 17),  # cumple mañana
        (date(2000, 1, 1), 26),
        (date(2026, 11, 2), 0),
        (date(2024, 2, 29), 2),  # nacido en año bisiesto
    ],
)
def test_age_considers_whether_birthday_has_passed(birth: date, expected: int) -> None:
    assert age_on(birth, TODAY) == expected


def test_guardian_required_until_the_day_of_the_18th_birthday() -> None:
    assert requires_guardian(date(2008, 11, 3), TODAY)  # 17 años
    assert not requires_guardian(date(2008, 11, 2), TODAY)  # justo 18


def test_birth_date_validation() -> None:
    validate_birth_date(date(1990, 5, 5), TODAY)
    with pytest.raises(ValueError, match="futura"):
        validate_birth_date(date(2026, 11, 3), TODAY)
    with pytest.raises(ValueError, match="plausible"):
        validate_birth_date(date(1890, 1, 1), TODAY)


@pytest.mark.parametrize("number", ["12345678", " 1234 5678 "])
def test_dni_accepts_eight_digits_and_strips_spaces(number: str) -> None:
    assert normalize_document(DocumentType.DNI, number) == "12345678"


@pytest.mark.parametrize("number", ["1234567", "123456789", "1234567A", ""])
def test_dni_rejects_anything_but_eight_digits(number: str) -> None:
    with pytest.raises(ValueError, match="8 dígitos"):
        normalize_document(DocumentType.DNI, number)


def test_passport_is_uppercased() -> None:
    assert normalize_document(DocumentType.PASSPORT, "ab123456") == "AB123456"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("912345678", "+51912345678"),
        ("912 345 678", "+51912345678"),
        ("51912345678", "+51912345678"),
        ("+51 912-345-678", "+51912345678"),
        ("+1 (415) 555-2671", "+14155552671"),
        ("012345678", "012345678"),  # fijo / formato local: se respeta
    ],
)
def test_phone_normalization(raw: str, expected: str) -> None:
    assert normalize_phone(raw) == expected


@pytest.mark.parametrize("raw", ["", "abc", "123", "+" + "1" * 20])
def test_invalid_phone_is_rejected(raw: str) -> None:
    with pytest.raises(ValueError, match="Teléfono"):
        normalize_phone(raw)


def test_hc_number_format_and_document_mask() -> None:
    assert format_hc_number(42) == "HC-000042"
    assert mask_document("12345678") == "*****678"
    assert mask_document("12") == "12"
