"""Reglas del embudo de posibles clientes (docs/07 §1). Dominio puro.

- Entre estados abiertos se puede mover libremente (el Kanban permite arrastrar hacia atrás).
- `LOST` exige un motivo; se puede reabrir a `NEW`.
- `CONVERTED` NO se asigna a mano: solo lo produce la conversión a paciente (que crea la HC).
"""

from app.domain.enums import LeadStatus

OPEN_STATUSES: frozenset[LeadStatus] = frozenset(
    {LeadStatus.NEW, LeadStatus.CONTACTED, LeadStatus.QUALIFIED, LeadStatus.APPOINTMENT_SET}
)


class InvalidLeadTransitionError(ValueError):
    """El cambio de estado solicitado no está permitido."""


def validate_transition(current: LeadStatus, target: LeadStatus, lost_reason: str | None) -> None:
    if current == target:
        return
    if current == LeadStatus.CONVERTED:
        raise InvalidLeadTransitionError(
            "Un lead convertido en paciente no puede cambiar de estado"
        )
    if target == LeadStatus.CONVERTED:
        raise InvalidLeadTransitionError("Para convertir use la acción 'Convertir en paciente'")
    if current == LeadStatus.LOST and target != LeadStatus.NEW:
        raise InvalidLeadTransitionError("Un lead perdido solo puede reabrirse como NUEVO")
    if target == LeadStatus.LOST and not (lost_reason and lost_reason.strip()):
        raise InvalidLeadTransitionError("Indique el motivo por el que se perdió el lead")
