"""Reloj único de la aplicación (facilita tests y evita `datetime.now()` sin zona)."""

from datetime import UTC, datetime


def utcnow() -> datetime:
    """Instante actual en UTC con zona horaria (ADR-008: la BD guarda UTC)."""
    return datetime.now(UTC)
