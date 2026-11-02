"""Reglas puras de la agenda: estados de cita, horario laboral y generación de huecos.

Dominio puro (sin FastAPI ni SQL): se prueba con valores directos. Todas las comparaciones de
horario se hacen en la **hora local de la clínica** (América/Lima) y se guardan en UTC
(ADR-008). Lima no tiene horario de verano, pero se usa `zoneinfo` por si cambiara.
"""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.domain.clinic import CLINIC_TIMEZONE
from app.domain.enums import AppointmentStatus

CLINIC_TZ = ZoneInfo(CLINIC_TIMEZONE)

MIN_DURATION_MINUTES = 5
MAX_DURATION_MINUTES = 240
DURATION_STEP_MINUTES = 5
# Margen para registrar una cita "de paso" (paciente que llega sin cita y se atiende ya).
PAST_TOLERANCE_MINUTES = 15
MAX_AVAILABILITY_DAYS = 14  # evita consultas de disponibilidad enormes
MAX_SERIES_SESSIONS = 20
MIN_SLOT_MINUTES = 5
MAX_SLOT_MINUTES = 240

S = AppointmentStatus

# Estados que ocupan el calendario (los cancelados y las ausencias liberan el hueco).
ACTIVE_STATUSES: frozenset[AppointmentStatus] = frozenset(
    {S.SCHEDULED, S.CONFIRMED, S.CHECKED_IN, S.IN_PROGRESS, S.COMPLETED}
)
# Solo estas citas pueden moverse a otro horario.
RESCHEDULABLE_STATUSES: frozenset[AppointmentStatus] = frozenset({S.SCHEDULED, S.CONFIRMED})

_TRANSITIONS: dict[AppointmentStatus, frozenset[AppointmentStatus]] = {
    S.SCHEDULED: frozenset({S.CONFIRMED, S.CHECKED_IN, S.CANCELLED, S.NO_SHOW}),
    S.CONFIRMED: frozenset({S.CHECKED_IN, S.CANCELLED, S.NO_SHOW}),
    S.CHECKED_IN: frozenset({S.IN_PROGRESS, S.CANCELLED}),
    S.IN_PROGRESS: frozenset({S.COMPLETED}),
    S.COMPLETED: frozenset(),
    S.CANCELLED: frozenset(),
    S.NO_SHOW: frozenset(),
}


class AgendaRuleError(ValueError):
    """Una regla de la agenda impide la operación (el mensaje es apto para mostrar)."""


# ----------------------------------------------------------------- estados
def can_transition(current: AppointmentStatus, target: AppointmentStatus) -> bool:
    return target in _TRANSITIONS[current]


def validate_transition(current: AppointmentStatus, target: AppointmentStatus) -> None:
    if not can_transition(current, target):
        raise AgendaRuleError(f"No se puede pasar una cita de {current.value} a {target.value}")


# ---------------------------------------------------------------- duración
def validate_duration(minutes: int) -> None:
    if not MIN_DURATION_MINUTES <= minutes <= MAX_DURATION_MINUTES:
        raise AgendaRuleError(
            f"La duración debe estar entre {MIN_DURATION_MINUTES} y {MAX_DURATION_MINUTES} minutos"
        )
    if minutes % DURATION_STEP_MINUTES:
        raise AgendaRuleError(f"La duración debe ser múltiplo de {DURATION_STEP_MINUTES} minutos")


# ------------------------------------------------------------------ tiempo
def ensure_aware(value: datetime) -> datetime:
    """Rechaza fechas sin zona horaria: serían ambiguas (¿hora de Lima o UTC?)."""
    if value.tzinfo is None:
        raise AgendaRuleError("La fecha y hora deben incluir zona horaria")
    return value


def to_clinic_local(value: datetime) -> datetime:
    return ensure_aware(value).astimezone(CLINIC_TZ)


def clinic_date(value: datetime) -> date:
    return to_clinic_local(value).date()


def at_clinic_time(day: date, moment: time) -> datetime:
    """Instante UTC de `day` a la hora local `moment` en la clínica."""
    return datetime.combine(day, moment, tzinfo=CLINIC_TZ).astimezone(UTC)


def intervals_overlap(
    a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime
) -> bool:
    """Intervalos semiabiertos [inicio, fin): una cita que termina a las 10:00 no choca con otra
    que empieza a las 10:00."""
    return a_start < b_end and b_start < a_end


def validate_not_in_past(starts_at: datetime, now: datetime) -> None:
    if starts_at < now - timedelta(minutes=PAST_TOLERANCE_MINUTES):
        raise AgendaRuleError("No se puede agendar una cita en el pasado")


# ----------------------------------------------------------- horario laboral
@dataclass(frozen=True)
class WorkingBlock:
    """Bloque de trabajo semanal de un doctor (hora local de la clínica)."""

    weekday: int  # 0 = lunes … 6 = domingo (como `date.weekday()`)
    start: time
    end: time
    slot_minutes: int
    valid_from: date | None = None
    valid_to: date | None = None

    def applies_on(self, day: date) -> bool:
        if day.weekday() != self.weekday:
            return False
        if self.valid_from and day < self.valid_from:
            return False
        return not (self.valid_to and day > self.valid_to)


def blocks_overlap(a: WorkingBlock, b: WorkingBlock) -> bool:
    """¿Dos bloques del mismo día se pisan (con vigencias que se cruzan)?"""
    if a.weekday != b.weekday:
        return False
    if not (a.start < b.end and b.start < a.end):
        return False
    a_from, a_to = a.valid_from or date.min, a.valid_to or date.max
    b_from, b_to = b.valid_from or date.min, b.valid_to or date.max
    return a_from <= b_to and b_from <= a_to


def validate_block(block: WorkingBlock) -> None:
    if not 0 <= block.weekday <= 6:
        raise AgendaRuleError("El día de la semana debe estar entre 0 (lunes) y 6 (domingo)")
    if block.end <= block.start:
        raise AgendaRuleError("La hora de fin debe ser posterior a la de inicio")
    if not MIN_SLOT_MINUTES <= block.slot_minutes <= MAX_SLOT_MINUTES:
        raise AgendaRuleError(
            f"El intervalo debe estar entre {MIN_SLOT_MINUTES} y {MAX_SLOT_MINUTES} minutos"
        )
    if block.valid_from and block.valid_to and block.valid_to < block.valid_from:
        raise AgendaRuleError("La vigencia termina antes de empezar")


def fits_working_hours(
    starts_at: datetime, ends_at: datetime, blocks: Iterable[WorkingBlock]
) -> bool:
    """¿La cita cabe COMPLETA dentro de un único bloque de trabajo de ese día?

    Una cita que cruza la medianoche o se reparte entre dos bloques (p. ej. antes y después
    del almuerzo) no cabe: el doctor no está disponible en el hueco intermedio.
    """
    local_start, local_end = to_clinic_local(starts_at), to_clinic_local(ends_at)
    if local_start.date() != local_end.date():
        return False
    day = local_start.date()
    return any(
        block.applies_on(day)
        and block.start <= local_start.time()
        and local_end.time() <= block.end
        for block in blocks
    )


def in_exception(day: date, ranges: Iterable[tuple[date, date]]) -> bool:
    """¿El día cae dentro de alguna excepción (vacaciones, feriado)? Rangos inclusivos."""
    return any(start <= day <= end for start, end in ranges)


# -------------------------------------------------------------- disponibilidad
def generate_slots(
    *,
    blocks: Sequence[WorkingBlock],
    day: date,
    duration_minutes: int,
    busy: Sequence[tuple[datetime, datetime]],
    now: datetime,
) -> list[datetime]:
    """Inicios de cita posibles ese día (UTC), en orden.

    Un hueco es válido si cabe entero en un bloque, no pisa citas ocupadas y no está en el
    pasado. Los inicios se alinean al intervalo (`slot_minutes`) de cada bloque.
    """
    validate_duration(duration_minutes)
    duration = timedelta(minutes=duration_minutes)
    slots: list[datetime] = []
    for block in sorted((b for b in blocks if b.applies_on(day)), key=lambda b: b.start):
        block_end = at_clinic_time(day, block.end)
        cursor = at_clinic_time(day, block.start)
        step = timedelta(minutes=block.slot_minutes)
        while cursor + duration <= block_end:
            if cursor >= now and not any(
                intervals_overlap(cursor, cursor + duration, b_start, b_end)
                for b_start, b_end in busy
            ):
                slots.append(cursor)
            cursor += step
    return slots
