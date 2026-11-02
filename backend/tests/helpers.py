"""Utilidades de tests: crear usuarios y autenticarse."""

from collections.abc import Iterable

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.security import hash_password
from app.domain.enums import ProfessionalBody, Role, Specialty
from app.models.user import User
from app.repositories.users import UserRepository

SessionFactory = async_sessionmaker[AsyncSession]

PASSWORD = "Clave-Segura-2026"


async def create_user(
    session_factory: SessionFactory,
    email: str,
    roles: Iterable[Role],
    *,
    password: str = PASSWORD,
    full_name: str = "Usuario de Prueba",
    is_active: bool = True,
) -> User:
    role_set = set(roles)
    async with session_factory() as session:
        repo = UserRepository(session)
        user = await repo.add(
            email=email,
            password_hash=hash_password(password),
            full_name=full_name,
            phone=None,
            roles=role_set,
        )
        if Role.DOCTOR in role_set:
            await repo.set_doctor_profile(
                user,
                license_number="CMP-000001",
                professional_body=ProfessionalBody.CMP.value,
                rne=None,
                specialties={Specialty.ACUPUNCTURE},
            )
        user.is_active = is_active
        await session.commit()
        return user


async def login(client: AsyncClient, email: str, password: str = PASSWORD) -> dict[str, str]:
    """Inicia sesión y devuelve la cabecera Authorization lista para usar."""
    response = await client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}
