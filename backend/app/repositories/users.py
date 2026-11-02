"""Persistencia de usuarios y perfiles profesionales."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import Role, Specialty
from app.models.user import DoctorProfile, DoctorSpecialty, User, UserRole


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, user_id: uuid.UUID) -> User | None:
        return await self._session.get(User, user_id)

    async def get_by_email(self, email: str) -> User | None:
        result = await self._session.execute(select(User).where(User.email == email.lower()))
        return result.scalar_one_or_none()

    async def list_users(self, *, limit: int, offset: int) -> list[User]:
        result = await self._session.execute(
            select(User).order_by(User.full_name, User.id).limit(limit).offset(offset)
        )
        return list(result.scalars().all())

    async def list_doctors(self) -> list[User]:
        """Usuarios activos con rol DOCTOR (directorio para asignaciones)."""
        result = await self._session.execute(
            select(User)
            .join(UserRole, UserRole.user_id == User.id)
            .where(UserRole.role == Role.DOCTOR.value, User.is_active.is_(True))
            .order_by(User.full_name)
        )
        return list(result.scalars().unique())

    async def add(
        self,
        *,
        email: str,
        password_hash: str,
        full_name: str,
        phone: str | None,
        roles: set[Role],
    ) -> User:
        user = User(
            email=email.lower(),
            password_hash=password_hash,
            full_name=full_name,
            phone=phone,
            roles=[UserRole(role=role.value) for role in sorted(roles)],
            # Se inicializa explícitamente: en SQLAlchemy async una relación sin cargar no
            # puede resolverse de forma perezosa (MissingGreenlet) al serializar la respuesta.
            doctor_profile=None,
        )
        self._session.add(user)
        await self._session.flush()  # asigna id y detecta duplicados de correo
        return user

    async def set_roles(self, user: User, roles: set[Role]) -> None:
        current = {Role(r.role) for r in user.roles}
        user.roles = [r for r in user.roles if Role(r.role) in roles]
        user.roles.extend(UserRole(role=role.value) for role in sorted(roles - current))
        await self._session.flush()

    async def set_doctor_profile(
        self,
        user: User,
        *,
        license_number: str,
        professional_body: str,
        rne: str | None,
        specialties: set[Specialty],
    ) -> None:
        user.doctor_profile = DoctorProfile(
            user_id=user.id,
            license_number=license_number,
            professional_body=professional_body,
            rne=rne,
            specialties=[DoctorSpecialty(specialty=s.value) for s in sorted(specialties)],
        )
        await self._session.flush()
