import pytest

from app.domain.password_policy import MIN_PASSWORD_LENGTH, validate_password


def test_accepts_strong_password() -> None:
    assert validate_password("Clave-Segura-2026", "ana@clinica.pe") == []


@pytest.mark.parametrize(
    ("password", "fragment"),
    [
        ("Corta1", "al menos"),
        ("SoloLetrasSinNumero", "número"),
        ("123456789012345", "letra"),
        ("password1234", "común"),
    ],
)
def test_rejects_weak_passwords(password: str, fragment: str) -> None:
    problems = validate_password(password)
    assert any(fragment in p for p in problems), problems


def test_rejects_password_containing_email_local_part() -> None:
    problems = validate_password("maria-gomez-2026", "maria-gomez@clinica.pe")
    assert any("correo" in p for p in problems)


def test_minimum_length_is_enforced_at_boundary() -> None:
    assert validate_password("a1" * (MIN_PASSWORD_LENGTH // 2 - 1)) != []
    assert validate_password("a1" * (MIN_PASSWORD_LENGTH // 2)) == []
