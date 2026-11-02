"""Consulta de la auditoría y verificación de su cadena de hash."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import AuditReader, AuditServiceDep
from app.schemas.audit import AuditLogRead, ChainVerification

router = APIRouter(prefix="/audit-logs", tags=["auditoría"])


@router.get("", response_model=list[AuditLogRead])
async def list_audit_logs(
    _: AuditReader,
    service: AuditServiceDep,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    action: str | None = None,
    actor_user_id: uuid.UUID | None = None,
    patient_id: uuid.UUID | None = None,
) -> list[AuditLogRead]:
    rows = await service.list_recent(
        limit=limit,
        offset=offset,
        action=action,
        actor_user_id=actor_user_id,
        patient_id=patient_id,
    )
    return [AuditLogRead.model_validate(r) for r in rows]


@router.get("/verify", response_model=ChainVerification)
async def verify_audit_chain(_: AuditReader, service: AuditServiceDep) -> ChainVerification:
    """Recalcula la cadena completa; `valid=false` indica manipulación."""
    return await service.verify_chain()
