"""Casos de uso de gestión de usuarios (alta, listado, edición) con auditoría."""

import uuid

from app.core.errors import AppError, ConflictError, NotFoundError, PermissionDeniedError
from app.core.security import hash_password
from app.domain.enums import AuditAction, Role
from app.domain.password_policy import validate_password
from app.domain.policies.permissions import can_assign_roles
from app.models.user import User
from app.repositories.unit_of_work import UnitOfWork
from app.repositories.users import UserRepository
from app.schemas.users import UserCreate, UserUpdate
from app.services.audit import AuditService, RequestContext


class WeakPasswordError(AppError):
    status_code = 422
    code = "weak_password"


class DoctorProfileRequiredError(AppError):
    status_code = 422
    code = "doctor_profile_required"


class UserService:
    def __init__(self, *, users: UserRepository, audit: AuditService, uow: UnitOfWork) -> None:
        self._users = users
        self._audit = audit
        self._uow = uow

    async def create_user(self, actor: User, data: UserCreate, context: RequestContext) -> User:
        if not can_assign_roles(actor.role_names, data.roles):
            raise PermissionDeniedError("Solo un SUPERUSER puede asignar roles SUPERUSER u OWNER")

        problems = validate_password(data.password, data.email)
        if problems:
            raise WeakPasswordError("; ".join(problems))

        if await self._users.get_by_email(data.email) is not None:
            raise ConflictError("Ya existe un usuario con ese correo")

        user = await self._users.add(
            email=data.email,
            password_hash=hash_password(data.password),
            full_name=data.full_name,
            phone=data.phone,
            roles=data.roles,
        )
        if data.doctor_profile is not None:
            profile = data.doctor_profile
            await self._users.set_doctor_profile(
                user,
                license_number=profile.license_number,
                professional_body=profile.professional_body.value,
                rne=profile.rne,
                specialties=profile.specialties,
            )
        await self._audit.record(
            AuditAction.USER_CREATE,
            actor_user_id=actor.id,
            actor_roles=actor.role_names,
            resource_type="user",
            resource_id=str(user.id),
            reason="roles=" + ",".join(sorted(r.value for r in data.roles)),
            context=context,
        )
        await self._uow.commit()
        return user

    async def list_users(self, *, limit: int, offset: int) -> list[User]:
        return await self._users.list_users(limit=limit, offset=offset)

    async def get_user(self, user_id: uuid.UUID) -> User:
        user = await self._users.get_by_id(user_id)
        if user is None:
            raise NotFoundError("Usuario no encontrado")
        return user

    async def update_user(
        self, actor: User, user_id: uuid.UUID, data: UserUpdate, context: RequestContext
    ) -> User:
        user = await self.get_user(user_id)
        # Un usuario con rol privilegiado solo puede ser modificado por un SUPERUSER
        # (o por sí mismo): evita que un OWNER edite o desactive a quien lo administra.
        if user.id != actor.id and not can_assign_roles(actor.role_names, user.role_names):
            raise PermissionDeniedError("No tienes permiso para modificar a este usuario")
        changes: list[str] = []

        if data.roles is not None:
            current = set(user.role_names)
            changed = current ^ data.roles  # diferencia simétrica: roles añadidos o retirados
            # Mismo invariante que en la creación: sin colegiatura un doctor no puede firmar
            # fichas. La edición del perfil profesional llegará con la gestión de doctores.
            if Role.DOCTOR in data.roles and user.doctor_profile is None:
                raise DoctorProfileRequiredError(
                    "El usuario no tiene perfil profesional; no se le puede asignar el rol DOCTOR"
                )
            if changed and not can_assign_roles(actor.role_names, changed):
                raise PermissionDeniedError(
                    "Solo un SUPERUSER puede asignar o retirar roles SUPERUSER u OWNER"
                )
            if changed:
                await self._users.set_roles(user, data.roles)
                changes.append("roles")

        if data.is_active is not None and data.is_active != user.is_active:
            if user.id == actor.id and not data.is_active:
                raise ConflictError("No puedes desactivar tu propia cuenta")
            user.is_active = data.is_active
            changes.append("is_active")

        if data.full_name is not None and data.full_name != user.full_name:
            user.full_name = data.full_name
            changes.append("full_name")
        if data.phone is not None and data.phone != user.phone:
            user.phone = data.phone
            changes.append("phone")

        await self._audit.record(
            AuditAction.USER_UPDATE,
            actor_user_id=actor.id,
            actor_roles=actor.role_names,
            resource_type="user",
            resource_id=str(user.id),
            reason="campos=" + (",".join(changes) or "ninguno"),
            context=context,
        )
        await self._uow.commit()
        return user
