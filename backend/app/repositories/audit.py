"""Persistencia de la auditoría: añade filas encadenadas y las lee en orden.

No existe `update` ni `delete` a propósito (y la BD los rechaza con un trigger).
"""

import uuid
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.audit_chain import GENESIS_HASH, canonical_timestamp, compute_row_hash
from app.models.audit_log import AuditLog

# Clave del bloqueo consultivo que serializa la escritura de la cadena. Constante arbitraria
# pero fija: todas las instancias de la API compiten por la misma cerradura.
_AUDIT_CHAIN_LOCK_KEY = 7_201_146_001
_VERIFY_BATCH = 1_000


def hashable_content(row: AuditLog) -> dict[str, Any]:
    """Contenido canónico de una fila (se usa al escribir **y** al verificar)."""
    return {
        "ts": canonical_timestamp(row.ts),
        "actor_user_id": str(row.actor_user_id) if row.actor_user_id else None,
        "actor_roles": row.actor_roles,
        "action": row.action,
        "resource_type": row.resource_type,
        "resource_id": row.resource_id,
        "patient_id": str(row.patient_id) if row.patient_id else None,
        "ip": row.ip,
        "user_agent": row.user_agent,
        "outcome": row.outcome,
        "reason": row.reason,
    }


class AuditRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def append(
        self,
        *,
        ts: datetime,
        actor_user_id: uuid.UUID | None,
        actor_roles: str | None,
        action: str,
        resource_type: str | None,
        resource_id: str | None,
        patient_id: uuid.UUID | None,
        ip: str | None,
        user_agent: str | None,
        outcome: str,
        reason: str | None,
    ) -> AuditLog:
        # Bloqueo hasta fin de transacción: dos escrituras simultáneas no pueden leer el mismo
        # "último hash" y bifurcar la cadena.
        await self._session.execute(
            text("SELECT pg_advisory_xact_lock(:key)"), {"key": _AUDIT_CHAIN_LOCK_KEY}
        )
        last = await self._session.execute(
            select(AuditLog.row_hash).order_by(AuditLog.id.desc()).limit(1)
        )
        prev_hash = last.scalar_one_or_none() or GENESIS_HASH

        row = AuditLog(
            ts=ts,
            actor_user_id=actor_user_id,
            actor_roles=actor_roles,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            patient_id=patient_id,
            ip=ip,
            user_agent=(user_agent or "")[:300] or None,
            outcome=outcome,
            reason=reason,
            prev_hash=prev_hash,
            row_hash="",
        )
        row.row_hash = compute_row_hash(prev_hash, hashable_content(row))
        self._session.add(row)
        await self._session.flush()
        return row

    async def list_recent(
        self,
        *,
        limit: int,
        offset: int,
        action: str | None = None,
        actor_user_id: uuid.UUID | None = None,
        patient_id: uuid.UUID | None = None,
    ) -> list[AuditLog]:
        query = select(AuditLog).order_by(AuditLog.id.desc()).limit(limit).offset(offset)
        if action:
            query = query.where(AuditLog.action == action)
        if actor_user_id:
            query = query.where(AuditLog.actor_user_id == actor_user_id)
        if patient_id:
            query = query.where(AuditLog.patient_id == patient_id)
        result = await self._session.execute(query)
        return list(result.scalars().all())

    async def iter_in_order(self) -> AsyncIterator[AuditLog]:
        """Recorre toda la cadena en orden por lotes (no carga todo en memoria)."""
        last_id = 0
        while True:
            result = await self._session.execute(
                select(AuditLog)
                .where(AuditLog.id > last_id)
                .order_by(AuditLog.id)
                .limit(_VERIFY_BATCH)
            )
            batch = list(result.scalars().all())
            if not batch:
                return
            for row in batch:
                yield row
            last_id = batch[-1].id
