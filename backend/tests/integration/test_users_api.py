"""Gestión de usuarios: matriz de permisos por rol y reglas anti-escalada."""

from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.domain.enums import Role
from tests.helpers import PASSWORD, SessionFactory, create_user, login

NEW_USER: dict[str, Any] = {
    "email": "nuevo@clinica-demo.pe",
    "full_name": "Persona Nueva",
    "password": "Otra-Clave-Larga-2026",
    "roles": ["RECEPTION"],
}


@pytest.mark.parametrize(
    ("role", "expected"),
    [
        (Role.SUPERUSER, 200),
        (Role.OWNER, 200),
        (Role.DOCTOR, 403),
        (Role.RECEPTION, 403),
        (Role.PATIENT, 403),
    ],
)
async def test_list_users_permission_matrix(
    client: AsyncClient, session_factory: SessionFactory, role: Role, expected: int
) -> None:
    await create_user(session_factory, "actor@clinica-demo.pe", [role])
    headers = await login(client, "actor@clinica-demo.pe")
    assert (await client.get("/users", headers=headers)).status_code == expected


async def test_unauthenticated_cannot_list_users(client: AsyncClient) -> None:
    assert (await client.get("/users")).status_code == 401


async def test_permission_denial_is_audited(
    client: AsyncClient, session_factory: SessionFactory, engine: AsyncEngine
) -> None:
    await create_user(session_factory, "recep@clinica-demo.pe", [Role.RECEPTION])
    headers = await login(client, "recep@clinica-demo.pe")
    await client.get("/users", headers=headers)

    async with engine.connect() as conn:
        row = (
            await conn.execute(
                text("SELECT outcome, reason FROM audit_logs WHERE action='PERMISSION_DENIED'")
            )
        ).one()
    assert row == ("DENIED", "permiso=users:read")


async def test_owner_creates_reception_user_who_can_then_login(
    client: AsyncClient, session_factory: SessionFactory
) -> None:
    await create_user(session_factory, "dueno@clinica-demo.pe", [Role.OWNER, Role.DOCTOR])
    headers = await login(client, "dueno@clinica-demo.pe")

    created = await client.post("/users", json=NEW_USER, headers=headers)
    assert created.status_code == 201
    assert created.json()["roles"] == ["RECEPTION"]
    assert "password" not in created.text

    assert (await login(client, NEW_USER["email"], NEW_USER["password"])).get("Authorization")


async def test_doctor_role_requires_professional_profile(
    client: AsyncClient, session_factory: SessionFactory
) -> None:
    await create_user(session_factory, "dueno@clinica-demo.pe", [Role.OWNER])
    headers = await login(client, "dueno@clinica-demo.pe")
    response = await client.post("/users", json={**NEW_USER, "roles": ["DOCTOR"]}, headers=headers)
    assert response.status_code == 422


async def test_doctor_is_created_with_license_and_specialties(
    client: AsyncClient, session_factory: SessionFactory
) -> None:
    await create_user(session_factory, "dueno@clinica-demo.pe", [Role.OWNER])
    headers = await login(client, "dueno@clinica-demo.pe")
    payload = {
        **NEW_USER,
        "roles": ["DOCTOR"],
        "doctor_profile": {
            "license_number": "CNP-123",
            "professional_body": "CNP",
            "specialties": ["NUTRITION"],
        },
    }
    response = await client.post("/users", json=payload, headers=headers)
    assert response.status_code == 201
    assert response.json()["doctor_profile"]["specialties"] == ["NUTRITION"]


async def test_weak_password_is_rejected_with_stable_code(
    client: AsyncClient, session_factory: SessionFactory
) -> None:
    await create_user(session_factory, "dueno@clinica-demo.pe", [Role.OWNER])
    headers = await login(client, "dueno@clinica-demo.pe")
    response = await client.post("/users", json={**NEW_USER, "password": "corta1"}, headers=headers)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "weak_password"


async def test_duplicate_email_is_conflict_case_insensitive(
    client: AsyncClient, session_factory: SessionFactory
) -> None:
    await create_user(session_factory, "dueno@clinica-demo.pe", [Role.OWNER])
    headers = await login(client, "dueno@clinica-demo.pe")
    await client.post("/users", json=NEW_USER, headers=headers)
    again = await client.post(
        "/users", json={**NEW_USER, "email": NEW_USER["email"].upper()}, headers=headers
    )
    assert again.status_code == 409


@pytest.mark.parametrize("privileged", [["OWNER"], ["SUPERUSER"], ["DOCTOR", "OWNER"]])
async def test_owner_cannot_create_privileged_users(
    client: AsyncClient, session_factory: SessionFactory, privileged: list[str]
) -> None:
    """Anti-escalada de privilegios: un OWNER no puede crear otro OWNER ni un SUPERUSER."""
    await create_user(session_factory, "dueno@clinica-demo.pe", [Role.OWNER])
    headers = await login(client, "dueno@clinica-demo.pe")
    payload = {**NEW_USER, "roles": privileged}
    if "DOCTOR" in privileged:
        payload["doctor_profile"] = {
            "license_number": "X-1",
            "professional_body": "CMP",
            "specialties": ["ACUPUNCTURE"],
        }
    assert (await client.post("/users", json=payload, headers=headers)).status_code == 403


async def test_superuser_can_create_owner(
    client: AsyncClient, session_factory: SessionFactory
) -> None:
    await create_user(session_factory, "super@clinica-demo.pe", [Role.SUPERUSER])
    headers = await login(client, "super@clinica-demo.pe")
    response = await client.post("/users", json={**NEW_USER, "roles": ["OWNER"]}, headers=headers)
    assert response.status_code == 201


async def test_owner_cannot_modify_a_superuser(
    client: AsyncClient, session_factory: SessionFactory
) -> None:
    await create_user(session_factory, "dueno@clinica-demo.pe", [Role.OWNER])
    boss = await create_user(session_factory, "super@clinica-demo.pe", [Role.SUPERUSER])
    headers = await login(client, "dueno@clinica-demo.pe")
    response = await client.patch(f"/users/{boss.id}", json={"is_active": False}, headers=headers)
    assert response.status_code == 403


async def test_user_cannot_deactivate_themselves(
    client: AsyncClient, session_factory: SessionFactory
) -> None:
    me = await create_user(session_factory, "dueno@clinica-demo.pe", [Role.OWNER])
    headers = await login(client, "dueno@clinica-demo.pe")
    response = await client.patch(f"/users/{me.id}", json={"is_active": False}, headers=headers)
    assert response.status_code == 409


async def test_role_change_takes_effect_on_next_request_without_new_login(
    client: AsyncClient, session_factory: SessionFactory
) -> None:
    await create_user(session_factory, "dueno@clinica-demo.pe", [Role.OWNER])
    target = await create_user(session_factory, "recep@clinica-demo.pe", [Role.RECEPTION])
    owner_headers = await login(client, "dueno@clinica-demo.pe")
    target_headers = await login(client, "recep@clinica-demo.pe")
    assert (await client.get("/users", headers=target_headers)).status_code == 403

    # El OWNER no puede otorgar OWNER; lo hace un SUPERUSER.
    await create_user(session_factory, "super@clinica-demo.pe", [Role.SUPERUSER])
    super_headers = await login(client, "super@clinica-demo.pe")
    patched = await client.patch(
        f"/users/{target.id}", json={"roles": ["OWNER"]}, headers=super_headers
    )
    assert patched.status_code == 200
    assert (await client.get("/users", headers=target_headers)).status_code == 200
    assert owner_headers  # el OWNER original sigue operativo


async def test_get_unknown_user_is_404(
    client: AsyncClient, session_factory: SessionFactory
) -> None:
    await create_user(session_factory, "dueno@clinica-demo.pe", [Role.OWNER])
    headers = await login(client, "dueno@clinica-demo.pe")
    response = await client.get("/users/00000000-0000-0000-0000-000000000000", headers=headers)
    assert response.status_code == 404


async def test_password_hash_is_never_exposed(
    client: AsyncClient, session_factory: SessionFactory
) -> None:
    await create_user(session_factory, "dueno@clinica-demo.pe", [Role.OWNER])
    headers = await login(client, "dueno@clinica-demo.pe")
    body = (await client.get("/users", headers=headers)).text
    assert "argon2" not in body and PASSWORD not in body and "password_hash" not in body
