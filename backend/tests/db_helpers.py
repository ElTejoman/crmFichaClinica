"""Consultas directas a la BD para verificar auditoría y defensas a nivel de base de datos."""

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine


async def audit_rows(engine: AsyncEngine, action: str | None = None) -> list[dict[str, Any]]:
    async with engine.connect() as conn:
        if action:
            rows = await conn.execute(
                text("SELECT * FROM audit_logs WHERE action = :a ORDER BY id"), {"a": action}
            )
        else:
            rows = await conn.execute(text("SELECT * FROM audit_logs ORDER BY id"))
        return [dict(r._mapping) for r in rows]


async def audit_dump(engine: AsyncEngine) -> str:
    """Toda la tabla de auditoría como texto (para comprobar que NO hay datos clínicos)."""
    return str(await audit_rows(engine))


async def execute(engine: AsyncEngine, sql: str, **params: Any) -> None:
    async with engine.begin() as conn:
        await conn.execute(text(sql), params)


async def scalar(engine: AsyncEngine, sql: str, **params: Any) -> Any:
    async with engine.connect() as conn:
        return (await conn.execute(text(sql), params)).scalar_one()
