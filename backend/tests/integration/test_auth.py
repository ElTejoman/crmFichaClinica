"""Flujo de autenticación completo contra la API real y PostgreSQL."""

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.domain.enums import Role
from tests.helpers import PASSWORD, SessionFactory, create_user, login

EMAIL = "ana.paredes@clinica-demo.pe"
GENERIC_ERROR = "Correo o contraseña incorrectos"


async def _post_with_refresh_cookie(client: AsyncClient, path: str, token: str | None):  # type: ignore[no-untyped-def]
    """Envía un refresh token concreto como cabecera Cookie, sin depender del cookie-jar."""
    client.cookies.clear()
    headers = {"Cookie": f"refresh_token={token}"} if token else {}
    return await client.post(path, headers=headers)


async def _audit_actions(engine: AsyncEngine) -> list[str]:
    async with engine.connect() as conn:
        rows = await conn.execute(text("SELECT action FROM audit_logs ORDER BY id"))
        return [r[0] for r in rows]


async def test_login_success_returns_access_token_and_secure_cookie(
    client: AsyncClient, session_factory: SessionFactory
) -> None:
    await create_user(session_factory, EMAIL, [Role.DOCTOR])
    response = await client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer" and body["expires_in"] == 15 * 60
    assert "refresh" not in body  # el refresh token NO viaja en el JSON
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=strict" in cookie


async def test_me_returns_profile_with_roles(
    client: AsyncClient, session_factory: SessionFactory
) -> None:
    await create_user(session_factory, EMAIL, [Role.OWNER, Role.DOCTOR])
    headers = await login(client, EMAIL)
    me = (await client.get("/auth/me", headers=headers)).json()

    assert me["email"] == EMAIL and me["roles"] == ["DOCTOR", "OWNER"]
    assert me["doctor_profile"]["specialties"] == ["ACUPUNCTURE"]
    assert "password" not in str(me)


@pytest.mark.parametrize(
    "headers",
    [{}, {"Authorization": "Bearer basura"}, {"Authorization": "Basic abc"}],
)
async def test_me_requires_valid_bearer(client: AsyncClient, headers: dict[str, str]) -> None:
    response = await client.get("/auth/me", headers=headers)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "not_authenticated"


async def test_wrong_password_and_unknown_user_give_identical_error(
    client: AsyncClient, session_factory: SessionFactory
) -> None:
    """Evita la enumeración de usuarios: misma respuesta en ambos casos."""
    await create_user(session_factory, EMAIL, [Role.DOCTOR])
    wrong = await client.post("/auth/login", json={"email": EMAIL, "password": "incorrecta-123"})
    unknown = await client.post(
        "/auth/login", json={"email": "nadie@clinica-demo.pe", "password": "incorrecta-123"}
    )
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()
    assert wrong.json()["error"]["message"] == GENERIC_ERROR


async def test_failed_logins_are_audited_even_though_request_failed(
    client: AsyncClient, session_factory: SessionFactory, engine: AsyncEngine
) -> None:
    await create_user(session_factory, EMAIL, [Role.DOCTOR])
    await client.post("/auth/login", json={"email": EMAIL, "password": "incorrecta-123"})
    await login(client, EMAIL)
    assert await _audit_actions(engine) == ["LOGIN_FAILED", "LOGIN"]


async def test_account_locks_after_max_failed_attempts_even_with_right_password(
    client: AsyncClient, session_factory: SessionFactory
) -> None:
    await create_user(session_factory, EMAIL, [Role.DOCTOR])
    for _ in range(5):
        await client.post("/auth/login", json={"email": EMAIL, "password": "incorrecta-123"})

    locked = await client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert locked.status_code == 401
    assert "bloqueada" in locked.json()["error"]["message"]


async def test_inactive_user_cannot_login(
    client: AsyncClient, session_factory: SessionFactory
) -> None:
    await create_user(session_factory, EMAIL, [Role.DOCTOR], is_active=False)
    response = await client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert response.status_code == 401
    assert response.json()["error"]["message"] == GENERIC_ERROR


async def test_refresh_rotates_token_and_issues_working_access_token(
    client: AsyncClient, session_factory: SessionFactory
) -> None:
    await create_user(session_factory, EMAIL, [Role.DOCTOR])
    await login(client, EMAIL)
    first_cookie = client.cookies.get("refresh_token")

    response = await client.post("/auth/refresh")
    assert response.status_code == 200
    assert client.cookies.get("refresh_token") != first_cookie  # rotación
    new_headers = {"Authorization": f"Bearer {response.json()['access_token']}"}
    assert (await client.get("/auth/me", headers=new_headers)).status_code == 200


async def test_reusing_a_rotated_refresh_token_revokes_the_whole_family(
    client: AsyncClient, session_factory: SessionFactory, engine: AsyncEngine
) -> None:
    """Un token ya usado que reaparece indica robo: se cierra la sesión entera."""
    await create_user(session_factory, EMAIL, [Role.DOCTOR])
    await login(client, EMAIL)
    stolen = client.cookies.get("refresh_token")
    assert stolen is not None
    await client.post("/auth/refresh")  # uso legítimo → rota
    legitimate_new = client.cookies.get("refresh_token")

    replay = await _post_with_refresh_cookie(client, "/auth/refresh", stolen)
    assert replay.status_code == 401

    # El token legítimo más reciente también quedó invalidado (familia revocada).
    after = await _post_with_refresh_cookie(client, "/auth/refresh", legitimate_new)
    assert after.status_code == 401
    assert "TOKEN_REUSE_DETECTED" in await _audit_actions(engine)


async def test_refresh_without_cookie_is_unauthorized(client: AsyncClient) -> None:
    assert (await client.post("/auth/refresh")).status_code == 401


async def test_logout_revokes_session_and_is_idempotent(
    client: AsyncClient, session_factory: SessionFactory
) -> None:
    await create_user(session_factory, EMAIL, [Role.DOCTOR])
    await login(client, EMAIL)
    token = client.cookies.get("refresh_token")

    assert (await client.post("/auth/logout")).status_code == 204
    assert (await _post_with_refresh_cookie(client, "/auth/refresh", token)).status_code == 401
    assert (await client.post("/auth/logout")).status_code == 204  # sin sesión: no falla


async def test_deactivated_user_loses_access_immediately(
    client: AsyncClient, session_factory: SessionFactory, engine: AsyncEngine
) -> None:
    """El JWT sigue vigente, pero se revalida contra la BD en cada petición."""
    user = await create_user(session_factory, EMAIL, [Role.DOCTOR])
    headers = await login(client, EMAIL)
    assert (await client.get("/auth/me", headers=headers)).status_code == 200

    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE users SET is_active = false WHERE id = :id"), {"id": user.id}
        )
    assert (await client.get("/auth/me", headers=headers)).status_code == 401


async def test_logout_audit_event_records_actor_roles(
    client: AsyncClient, session_factory: SessionFactory, engine: AsyncEngine
) -> None:
    await create_user(session_factory, EMAIL, [Role.OWNER, Role.DOCTOR])
    await login(client, EMAIL)
    await client.post("/auth/logout")
    async with engine.connect() as conn:
        roles = (
            await conn.execute(text("SELECT actor_roles FROM audit_logs WHERE action='LOGOUT'"))
        ).scalar_one()
    assert roles == "DOCTOR,OWNER"
