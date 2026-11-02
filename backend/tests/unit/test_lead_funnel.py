import pytest

from app.domain.enums import LeadStatus
from app.domain.lead_funnel import (
    OPEN_STATUSES,
    InvalidLeadTransitionError,
    validate_transition,
)

S = LeadStatus


def test_open_statuses_can_move_freely_between_each_other() -> None:
    for a in OPEN_STATUSES:
        for b in OPEN_STATUSES:
            validate_transition(a, b, None)  # no lanza (incluye mover hacia atrás)


def test_marking_lost_requires_a_reason() -> None:
    with pytest.raises(InvalidLeadTransitionError, match="motivo"):
        validate_transition(S.CONTACTED, S.LOST, None)
    with pytest.raises(InvalidLeadTransitionError, match="motivo"):
        validate_transition(S.CONTACTED, S.LOST, "   ")
    validate_transition(S.CONTACTED, S.LOST, "Precio")


def test_converted_cannot_be_set_manually() -> None:
    with pytest.raises(InvalidLeadTransitionError, match="Convertir"):
        validate_transition(S.QUALIFIED, S.CONVERTED, None)


def test_converted_is_terminal() -> None:
    for target in (S.NEW, S.CONTACTED, S.LOST):
        with pytest.raises(InvalidLeadTransitionError, match="convertido"):
            validate_transition(S.CONVERTED, target, "x")


def test_lost_can_only_be_reopened_as_new() -> None:
    validate_transition(S.LOST, S.NEW, None)
    with pytest.raises(InvalidLeadTransitionError, match="NUEVO"):
        validate_transition(S.LOST, S.QUALIFIED, None)


def test_same_status_is_a_noop() -> None:
    validate_transition(S.LOST, S.LOST, None)
