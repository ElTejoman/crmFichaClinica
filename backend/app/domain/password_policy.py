"""Política de contraseñas (docs/06 §2): longitud y complejidad mínimas, sin datos obvios."""

MIN_PASSWORD_LENGTH = 12

# Lista mínima de contraseñas comunes; en Fase 7 se sustituye por una lista más extensa.
_COMMON = frozenset(
    {"password1234", "123456789012", "qwertyuiop12", "contrasena123", "administrador1"}
)


def validate_password(password: str, email: str = "") -> list[str]:
    """Devuelve la lista de problemas (vacía si la contraseña es aceptable)."""
    problems: list[str] = []
    if len(password) < MIN_PASSWORD_LENGTH:
        problems.append(f"Debe tener al menos {MIN_PASSWORD_LENGTH} caracteres")
    if not any(c.isalpha() for c in password):
        problems.append("Debe incluir al menos una letra")
    if not any(c.isdigit() for c in password):
        problems.append("Debe incluir al menos un número")
    if password.lower() in _COMMON:
        problems.append("Es demasiado común")
    local_part = email.split("@")[0].lower()
    if len(local_part) >= 4 and local_part in password.lower():
        problems.append("No debe contener su correo")
    return problems
