"""Auditoría: cadena verificable, inmutabilidad en BD y concurrencia."""

import asyncio

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncEngine

from app.domain.enums import Role
from tests.helpers import SessionFactory, create_user, login


async def _superuser_headers(
    client: AsyncClient,
    session_factory: SessionFactory,
) -> dict[str, str]:
    await create_user(session_factory, "super@clinica-demo.pe", [Role.SUPERUSER])
    return await login(client, "super@clinica-demo.pe")


async def test_chain_is_valid_after_normal_activity(
    client: AsyncClient, session_factory: SessionFactory
) -> None:
    headers = await _superuser_headers(client, session_factory)
    await client.post(
        "/auth/login", json={"email": "x@clinica-demo.pe", "password": "mala-clave-1"}
    )
    await client.get("/users", headers=headers)

    result = (await client.get("/audit-logs/verify", headers=headers)).json()
    assert result["valid"] is True and result["checked"] >= 2 and result["first_broken_id"] is None


async def test_chain_remains_valid_under_concurrent_writes(
    client: AsyncClient, session_factory: SessionFactory
) -> None:
    """El bloqueo consultivo evita que dos escrituras lean el mismo 'último hash'."""
    headers = await _superuser_headers(client, session_factory)
    await asyncio.gather(
        *(
            client.post(
                "/auth/login", json={"email": f"u{i}@clinica-demo.pe", "password": "mala-clave-1"}
            )
            for i in range(20)
        )
    )
    result = (await client.get("/audit-logs/verify", headers=headers)).json()
    assert result["valid"] is True and result["checked"] >= 21


async def test_tampering_is_detected(
    client: AsyncClient, session_factory: SessionFactory, engine: AsyncEngine
) -> None:
    headers = await _superuser_headers(client, session_factory)
    await client.get("/users", headers=headers)
    # Un administrador de BD con privilegios desactiva el trigger y altera una fila.
    async with engine.begin() as conn:
        await conn.execute(text("ALTER TABLE audit_logs DISABLE TRIGGER USER"))
        await conn.execute(text("UPDATE audit_logs SET action = 'READ' WHERE id = 1"))
        await conn.execute(text("ALTER TABLE audit_logs ENABLE TRIGGER USER"))

    result = (await client.get("/audit-logs/verify", headers=headers)).json()
    assert result["valid"] is False and result["first_broken_id"] == 1


async def test_deleted_audit_row_is_detected(
    client: AsyncClient, session_factory: SessionFactory, engine: AsyncEngine
) -> None:
    headers = await _superuser_headers(client, session_factory)  # fila 1 (LOGIN)
    for _ in range(2):  # filas 2 y 3 (las lecturas exitosas de /users no se auditan)
        await client.post("/auth/login", json={"email": "x@clinica-demo.pe", "password": "mala-1"})
    async with engine.begin() as conn:
        await conn.execute(text("ALTER TABLE audit_logs DISABLE TRIGGER USER"))
        await conn.execute(text("DELETE FROM audit_logs WHERE id = 2"))
        await conn.execute(text("ALTER TABLE audit_logs ENABLE TRIGGER USER"))

    result = (await client.get("/audit-logs/verify", headers=headers)).json()
    assert result["valid"] is False


@pytest.mark.parametrize(
    "statement",
    [
        "UPDATE audit_logs SET outcome = 'SUCCESS'",
        "DELETE FROM audit_logs",
        "TRUNCATE audit_logs",
    ],
)
async def test_database_rejects_mutation_of_audit_log(
    client: AsyncClient,
    session_factory: SessionFactory,
    engine: AsyncEngine,
    statement: str,
) -> None:
    await _superuser_headers(client, session_factory)  # genera al menos una fila (LOGIN)
    with pytest.raises(DBAPIError, match="append-only"):
        async with engine.begin() as conn:
            await conn.execute(text(statement))


async def test_audit_listing_is_forbidden_for_non_admins(
    client: AsyncClient, session_factory: SessionFactory
) -> None:
    await create_user(session_factory, "doc@clinica-demo.pe", [Role.DOCTOR])
    headers = await login(client, "doc@clinica-demo.pe")
    assert (await client.get("/audit-logs", headers=headers)).status_code == 403
    assert (await client.get("/audit-logs/verify", headers=headers)).status_code == 403


async def test_audit_listing_supports_filtering_by_action(
    client: AsyncClient, session_factory: SessionFactory
) -> None:
    headers = await _superuser_headers(client, session_factory)
    await client.post(
        "/auth/login", json={"email": "x@clinica-demo.pe", "password": "mala-clave-1"}
    )
    rows = (await client.get("/audit-logs?action=LOGIN_FAILED", headers=headers)).json()
    assert rows and all(r["action"] == "LOGIN_FAILED" for r in rows)
    assert "user_agent" not in rows[0]  # no se expone más de lo necesario
