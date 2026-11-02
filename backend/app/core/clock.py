"""Reloj único de la aplicación (facilita tests y evita `datetime.now()` sin zona)."""

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.core.config import CLINIC_TIMEZONE


def utcnow() -> datetime:
    """Instante actual en UTC con zona horaria (ADR-008: la BD guarda UTC)."""
    return datetime.now(UTC)


def lima_today() -> date:
    """Fecha civil en la clínica: la edad y los "pendientes de hoy" se calculan en hora local."""
    return datetime.now(ZoneInfo(CLINIC_TIMEZONE)).date()


def lima_end_of_today() -> datetime:
    """Último instante del día en Lima, expresado en UTC (límite de "pendientes de hoy")."""
    tz = ZoneInfo(CLINIC_TIMEZONE)
    next_midnight = datetime.combine(lima_today() + timedelta(days=1), time.min, tzinfo=tz)
    return next_midnight.astimezone(UTC) - timedelta(microseconds=1)
