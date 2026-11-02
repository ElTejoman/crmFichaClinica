"""Reglas puras de la agenda. Lima es UTC-5 todo el año: 09:00 local = 14:00 UTC."""

import itertools
from datetime import UTC, date, datetime, time, timedelta

import pytest

from app.domain.agenda_rules import (
    MAX_DURATION_MINUTES,
    PAST_TOLERANCE_MINUTES,
    AgendaRuleError,
    WorkingBlock,
    at_clinic_time,
    blocks_overlap,
    can_transition,
    clinic_date,
    ensure_aware,
    fits_working_hours,
    generate_slots,
    in_exception,
    intervals_overlap,
    validate_block,
    validate_duration,
    validate_not_in_past,
    validate_transition,
)
from app.domain.enums import AppointmentStatus as S

MONDAY = date(2026, 11, 2)  # lunes
TUESDAY = date(2026, 11, 3)


def utc(day: date, hour: int, minute: int = 0) -> datetime:
    """Instante UTC a partir de una hora LOCAL de Lima."""
    return at_clinic_time(day, time(hour, minute))


MORNING = WorkingBlock(weekday=0, start=time(9), end=time(13), slot_minutes=30)
AFTERNOON = WorkingBlock(weekday=0, start=time(15), end=time(19), slot_minutes=30)
FAR_PAST = datetime(2020, 1, 1, tzinfo=UTC)


# ------------------------------------------------------------------ estados
def test_happy_path_is_allowed_step_by_step() -> None:
    path = [S.SCHEDULED, S.CONFIRMED, S.CHECKED_IN, S.IN_PROGRESS, S.COMPLETED]
    for current, target in itertools.pairwise(path):
        validate_transition(current, target)


@pytest.mark.parametrize("terminal", [S.COMPLETED, S.CANCELLED, S.NO_SHOW])
def test_terminal_states_allow_nothing(terminal: S) -> None:
    for target in S:
        assert not can_transition(terminal, target)


@pytest.mark.parametrize(
    ("current", "target"),
    [
        (S.SCHEDULED, S.IN_PROGRESS),  # no se puede atender sin check-in
        (S.SCHEDULED, S.COMPLETED),
        (S.CONFIRMED, S.IN_PROGRESS),
        (S.CHECKED_IN, S.COMPLETED),  # primero debe iniciarse
        (S.IN_PROGRESS, S.CANCELLED),  # una atención iniciada ya no se cancela
        (S.CHECKED_IN, S.NO_SHOW),  # si ya llegó, no es ausencia
    ],
)
def test_illegal_transitions_are_rejected(current: S, target: S) -> None:
    with pytest.raises(AgendaRuleError, match="No se puede pasar"):
        validate_transition(current, target)


def test_reception_can_check_in_without_prior_confirmation() -> None:
    assert can_transition(S.SCHEDULED, S.CHECKED_IN)


# ----------------------------------------------------------------- duración
@pytest.mark.parametrize("minutes", [5, 30, 60, MAX_DURATION_MINUTES])
def test_valid_durations(minutes: int) -> None:
    validate_duration(minutes)


@pytest.mark.parametrize("minutes", [0, 4, 7, 32, MAX_DURATION_MINUTES + 5, -30])
def test_invalid_durations(minutes: int) -> None:
    with pytest.raises(AgendaRuleError):
        validate_duration(minutes)


# ------------------------------------------------------------------- tiempo
def test_back_to_back_appointments_do_not_overlap() -> None:
    nine, ten, eleven = utc(MONDAY, 9), utc(MONDAY, 10), utc(MONDAY, 11)
    assert not intervals_overlap(nine, ten, ten, eleven)  # una termina cuando empieza la otra
    assert intervals_overlap(nine, eleven, ten, eleven)
    assert intervals_overlap(nine, eleven, nine, ten)  # contenida
    assert intervals_overlap(ten, eleven, nine, eleven)


def test_naive_datetimes_are_rejected() -> None:
    with pytest.raises(AgendaRuleError, match="zona horaria"):
        ensure_aware(datetime(2026, 11, 2, 9, 0))


def test_clinic_date_uses_lima_not_utc() -> None:
    """21:00 en Lima del lunes ya es martes en UTC: el día de la cita es el de Lima."""
    monday_9pm_lima = datetime(2026, 11, 3, 2, 0, tzinfo=UTC)
    assert clinic_date(monday_9pm_lima) == MONDAY


def test_at_clinic_time_converts_to_utc() -> None:
    assert at_clinic_time(MONDAY, time(9)) == datetime(2026, 11, 2, 14, 0, tzinfo=UTC)


def test_past_appointments_are_rejected_beyond_the_tolerance() -> None:
    now = datetime(2026, 11, 2, 15, 0, tzinfo=UTC)
    validate_not_in_past(now - timedelta(minutes=PAST_TOLERANCE_MINUTES), now)  # justo en el límite
    validate_not_in_past(now + timedelta(days=1), now)
    with pytest.raises(AgendaRuleError, match="pasado"):
        validate_not_in_past(now - timedelta(minutes=PAST_TOLERANCE_MINUTES + 1), now)


# ------------------------------------------------------------ horario laboral
def test_appointment_inside_a_block_fits() -> None:
    assert fits_working_hours(utc(MONDAY, 9), utc(MONDAY, 10), [MORNING])
    assert fits_working_hours(utc(MONDAY, 12), utc(MONDAY, 13), [MORNING])  # hasta el borde


@pytest.mark.parametrize(
    ("start_h", "end_h"),
    [(8, 9), (12, 14), (13, 14), (14, 15)],  # antes, desbordando, fuera, en el almuerzo
)
def test_appointment_outside_blocks_does_not_fit(start_h: int, end_h: int) -> None:
    assert not fits_working_hours(utc(MONDAY, start_h), utc(MONDAY, end_h), [MORNING, AFTERNOON])


def test_appointment_spanning_lunch_gap_between_two_blocks_does_not_fit() -> None:
    assert not fits_working_hours(utc(MONDAY, 12, 30), utc(MONDAY, 15, 30), [MORNING, AFTERNOON])


def test_other_weekday_has_no_availability() -> None:
    assert not fits_working_hours(utc(TUESDAY, 9), utc(TUESDAY, 10), [MORNING])


def test_appointment_crossing_midnight_never_fits() -> None:
    all_day = WorkingBlock(weekday=0, start=time(0), end=time(23, 59), slot_minutes=30)
    assert not fits_working_hours(utc(MONDAY, 23), utc(TUESDAY, 1), [all_day])


def test_block_validity_window_is_respected() -> None:
    from_next_week = WorkingBlock(0, time(9), time(13), 30, valid_from=date(2026, 11, 9))
    until_last_week = WorkingBlock(0, time(9), time(13), 30, valid_to=date(2026, 10, 26))
    assert not fits_working_hours(utc(MONDAY, 9), utc(MONDAY, 10), [from_next_week])
    assert not fits_working_hours(utc(MONDAY, 9), utc(MONDAY, 10), [until_last_week])
    assert fits_working_hours(
        utc(date(2026, 11, 9), 9), utc(date(2026, 11, 9), 10), [from_next_week]
    )


# ------------------------------------------------------- validación de bloques
def test_block_validation() -> None:
    validate_block(MORNING)
    with pytest.raises(AgendaRuleError, match="fin"):
        validate_block(WorkingBlock(0, time(13), time(9), 30))
    with pytest.raises(AgendaRuleError, match="semana"):
        validate_block(WorkingBlock(7, time(9), time(13), 30))
    with pytest.raises(AgendaRuleError, match="intervalo"):
        validate_block(WorkingBlock(0, time(9), time(13), 1))
    with pytest.raises(AgendaRuleError, match="vigencia"):
        validate_block(WorkingBlock(0, time(9), time(13), 30, date(2026, 5, 2), date(2026, 5, 1)))


def test_blocks_overlap_detection() -> None:
    assert blocks_overlap(MORNING, WorkingBlock(0, time(12), time(14), 30))
    assert not blocks_overlap(MORNING, AFTERNOON)
    assert not blocks_overlap(MORNING, WorkingBlock(0, time(13), time(15), 30))  # contiguos
    assert not blocks_overlap(MORNING, WorkingBlock(1, time(9), time(13), 30))  # otro día
    # Mismo horario pero vigencias que no se cruzan: no chocan.
    old = WorkingBlock(0, time(9), time(13), 30, valid_to=date(2026, 6, 30))
    new = WorkingBlock(0, time(9), time(13), 30, valid_from=date(2026, 7, 1))
    assert not blocks_overlap(old, new)


def test_exception_ranges_are_inclusive() -> None:
    vacation = [(date(2026, 11, 2), date(2026, 11, 6))]
    assert in_exception(date(2026, 11, 2), vacation)
    assert in_exception(date(2026, 11, 6), vacation)
    assert not in_exception(date(2026, 11, 7), vacation)
    assert not in_exception(MONDAY, [])


# --------------------------------------------------------------- disponibilidad
def test_slots_are_aligned_to_the_block_interval_and_fit_the_duration() -> None:
    slots = generate_slots(blocks=[MORNING], day=MONDAY, duration_minutes=60, busy=[], now=FAR_PAST)
    assert slots[0] == utc(MONDAY, 9)
    assert slots[-1] == utc(MONDAY, 12)  # la última de 60 min que cabe antes de las 13:00
    assert len(slots) == 7  # 9:00, 9:30, …, 12:00


def test_slots_skip_busy_intervals_but_allow_adjacent_ones() -> None:
    busy = [(utc(MONDAY, 10), utc(MONDAY, 11))]
    slots = generate_slots(
        blocks=[MORNING], day=MONDAY, duration_minutes=30, busy=busy, now=FAR_PAST
    )
    assert utc(MONDAY, 10) not in slots and utc(MONDAY, 10, 30) not in slots
    assert utc(MONDAY, 9, 30) in slots  # termina justo cuando empieza la ocupada
    assert utc(MONDAY, 11) in slots  # empieza justo cuando termina la ocupada


def test_slots_never_cross_into_the_lunch_gap() -> None:
    slots = generate_slots(
        blocks=[MORNING, AFTERNOON], day=MONDAY, duration_minutes=60, busy=[], now=FAR_PAST
    )
    assert utc(MONDAY, 12, 30) not in slots  # terminaría a las 13:30
    assert utc(MONDAY, 15) in slots and utc(MONDAY, 13) not in slots


def test_past_slots_are_excluded() -> None:
    now = utc(MONDAY, 10, 15)
    slots = generate_slots(blocks=[MORNING], day=MONDAY, duration_minutes=30, busy=[], now=now)
    assert slots[0] == utc(MONDAY, 10, 30)


def test_no_slots_on_days_without_blocks_or_when_too_long() -> None:
    assert (
        generate_slots(blocks=[MORNING], day=TUESDAY, duration_minutes=30, busy=[], now=FAR_PAST)
        == []
    )
    assert generate_slots(
        blocks=[MORNING], day=MONDAY, duration_minutes=240, busy=[], now=FAR_PAST
    ) == [utc(MONDAY, 9)]
    short = WorkingBlock(0, time(9), time(9, 30), 30)
    assert (
        generate_slots(blocks=[short], day=MONDAY, duration_minutes=60, busy=[], now=FAR_PAST) == []
    )


def test_slots_reject_invalid_duration() -> None:
    with pytest.raises(AgendaRuleError):
        generate_slots(blocks=[MORNING], day=MONDAY, duration_minutes=7, busy=[], now=FAR_PAST)
