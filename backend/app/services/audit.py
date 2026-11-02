"""Servicio de auditoría: único punto por el que el resto de servicios registran eventos."""

import uuid
from collections.abc import Iterable
from dataclasses import dataclass

from app.core.clock import utcnow
from app.domain.audit_chain import first_broken_index
from app.domain.enums import AuditAction, AuditOutcome, Role
from app.models.audit_log import AuditLog
from app.repositories.audit import AuditRepository, hashable_content
from app.schemas.audit import ChainVerification


@dataclass(frozen=True)
class RequestContext:
    """Quién y desde dónde se hace la petición (alimenta la auditoría)."""

    ip: str | None = None
    user_agent: str | None = None


class AuditService:
    def __init__(self, repository: AuditRepository) -> None:
        self._repository = repository

    async def record(
        self,
        action: AuditAction,
        *,
        outcome: AuditOutcome = AuditOutcome.SUCCESS,
        actor_user_id: uuid.UUID | None = None,
        actor_roles: Iterable[Role] = (),
        resource_type: str | None = None,
        resource_id: str | None = None,
        patient_id: uuid.UUID | None = None,
        reason: str | None = None,
        context: RequestContext | None = None,
    ) -> AuditLog:
        """Añade un evento a la cadena. El llamador decide cuándo confirmar la transacción.

        `reason` es texto corto controlado por el sistema; NUNCA debe incluir contenido clínico
        ni datos personales (la auditoría es legible por más roles que la ficha).
        """
        context = context or RequestContext()
        roles = ",".join(sorted(r.value for r in actor_roles)) or None
        return await self._repository.append(
            ts=utcnow(),
            actor_user_id=actor_user_id,
            actor_roles=roles,
            action=action.value,
            resource_type=resource_type,
            resource_id=resource_id,
            patient_id=patient_id,
            ip=context.ip,
            user_agent=context.user_agent,
            outcome=outcome.value,
            reason=reason,
        )

    async def list_recent(
        self,
        *,
        limit: int,
        offset: int,
        action: str | None = None,
        actor_user_id: uuid.UUID | None = None,
        patient_id: uuid.UUID | None = None,
    ) -> list[AuditLog]:
        return await self._repository.list_recent(
            limit=limit,
            offset=offset,
            action=action,
            actor_user_id=actor_user_id,
            patient_id=patient_id,
        )

    async def verify_chain(self) -> ChainVerification:
        """Recorre toda la cadena y detecta alteraciones o filas faltantes."""
        rows = [row async for row in self._repository.iter_in_order()]
        broken = first_broken_index(
            (row.prev_hash, row.row_hash, hashable_content(row)) for row in rows
        )
        return ChainVerification(
            valid=broken is None,
            checked=len(rows),
            first_broken_id=None if broken is None else rows[broken].id,
        )
