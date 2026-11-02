"""Dependencias de FastAPI (inyección). Único lugar donde se "cablean" las capas.

Aquí se construyen repositorios y servicios por petición, y viven la autenticación
(`get_current_user`) y la autorización (`require_permission`). Es la raíz de composición:
por eso puede conocer repositorios y sesión de BD (excepción documentada en el test de capas).
"""

from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings, get_settings
from app.core.errors import AuthenticationError, PermissionDeniedError
from app.core.security import InvalidTokenError, decode_access_token
from app.domain.enums import AuditAction, AuditOutcome
from app.domain.policies.permissions import Permission, can
from app.models.user import User
from app.repositories.audit import AuditRepository
from app.repositories.care_team import CareTeamRepository
from app.repositories.health import HealthRepository
from app.repositories.leads import LeadRepository
from app.repositories.patients import PatientRepository
from app.repositories.refresh_tokens import RefreshTokenRepository
from app.repositories.unit_of_work import UnitOfWork
from app.repositories.users import UserRepository
from app.services.audit import AuditService, RequestContext
from app.services.auth import AuthService
from app.services.health import HealthService
from app.services.leads import LeadService
from app.services.patients import PatientService
from app.services.users import UserService


async def get_db_session(request: Request) -> AsyncIterator[AsyncSession]:
    """Una sesión por petición, tomada de la fábrica guardada en `app.state`."""
    factory: async_sessionmaker[AsyncSession] = request.app.state.session_factory
    async with factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


DbSession = Annotated[AsyncSession, Depends(get_db_session)]


def get_app_settings(request: Request) -> Settings:
    """Settings de la app en ejecución (permite sobrescribirlos en tests)."""
    settings: Settings = getattr(request.app.state, "settings", None) or get_settings()
    return settings


SettingsDep = Annotated[Settings, Depends(get_app_settings)]


def get_request_context(request: Request) -> RequestContext:
    """IP y user-agent para auditoría. Tras un proxy habrá que confiar en X-Forwarded-For
    solo desde proxies conocidos (pendiente Fase 7)."""
    return RequestContext(
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )


ContextDep = Annotated[RequestContext, Depends(get_request_context)]


# ------------------------------------------------------------------ servicios
def get_health_service(session: DbSession) -> HealthService:
    return HealthService(HealthRepository(session))


def get_audit_service(session: DbSession) -> AuditService:
    return AuditService(AuditRepository(session))


def get_auth_service(
    session: DbSession,
    audit: Annotated[AuditService, Depends(get_audit_service)],
    settings: SettingsDep,
) -> AuthService:
    return AuthService(
        users=UserRepository(session),
        refresh_tokens=RefreshTokenRepository(session),
        audit=audit,
        uow=UnitOfWork(session),
        settings=settings,
    )


def get_user_service(
    session: DbSession, audit: Annotated[AuditService, Depends(get_audit_service)]
) -> UserService:
    return UserService(users=UserRepository(session), audit=audit, uow=UnitOfWork(session))


def get_patient_service(
    session: DbSession,
    audit: Annotated[AuditService, Depends(get_audit_service)],
    settings: SettingsDep,
) -> PatientService:
    return PatientService(
        patients=PatientRepository(session),
        care_team=CareTeamRepository(session),
        users=UserRepository(session),
        audit=audit,
        uow=UnitOfWork(session),
        settings=settings,
    )


def get_lead_service(
    session: DbSession,
    audit: Annotated[AuditService, Depends(get_audit_service)],
    patient_service: Annotated[PatientService, Depends(get_patient_service)],
) -> LeadService:
    return LeadService(
        leads=LeadRepository(session),
        patients=PatientRepository(session),
        patient_service=patient_service,
        users=UserRepository(session),
        audit=audit,
        uow=UnitOfWork(session),
    )


HealthServiceDep = Annotated[HealthService, Depends(get_health_service)]
AuditServiceDep = Annotated[AuditService, Depends(get_audit_service)]
AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]
UserServiceDep = Annotated[UserService, Depends(get_user_service)]
PatientServiceDep = Annotated[PatientService, Depends(get_patient_service)]
LeadServiceDep = Annotated[LeadService, Depends(get_lead_service)]


# ------------------------------------------------------ autenticación / permisos
_BEARER_PREFIX = "bearer "


async def get_current_user(request: Request, session: DbSession, settings: SettingsDep) -> User:
    """Autentica por JWT de acceso y **recarga el usuario de la BD** en cada petición:
    así desactivaciones y cambios de rol aplican de inmediato (no esperan al vencimiento)."""
    header = request.headers.get("authorization", "")
    if not header.lower().startswith(_BEARER_PREFIX):
        raise AuthenticationError("Se requiere autenticación")
    try:
        claims = decode_access_token(
            header[len(_BEARER_PREFIX) :].strip(), settings.jwt_secret.get_secret_value()
        )
    except InvalidTokenError as exc:
        raise AuthenticationError("Token inválido o expirado") from exc

    user = await UserRepository(session).get_by_id(claims.user_id)
    if user is None or not user.is_active:
        raise AuthenticationError("Token inválido o expirado")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_permission(permission: Permission) -> Callable[..., Awaitable[User]]:
    """Fábrica de dependencias: exige un permiso y audita cada denegación."""

    async def checker(
        user: CurrentUser,
        audit: AuditServiceDep,
        session: DbSession,
        context: ContextDep,
    ) -> User:
        if can(user.role_names, permission):
            return user
        await audit.record(
            AuditAction.PERMISSION_DENIED,
            outcome=AuditOutcome.DENIED,
            actor_user_id=user.id,
            actor_roles=user.role_names,
            reason=f"permiso={permission.value}",
            context=context,
        )
        await UnitOfWork(session).commit()  # persistir la denegación antes de responder 403
        raise PermissionDeniedError("No tienes permiso para realizar esta acción")

    return checker


# Alias por permiso: los routers los usan sin conocer el modelo `User` (regla de capas).
UsersReader = Annotated[User, Depends(require_permission(Permission.USERS_READ))]
UsersManager = Annotated[User, Depends(require_permission(Permission.USERS_MANAGE))]
AuditReader = Annotated[User, Depends(require_permission(Permission.AUDIT_READ))]
PatientsReader = Annotated[User, Depends(require_permission(Permission.PATIENTS_READ))]
PatientsManager = Annotated[User, Depends(require_permission(Permission.PATIENTS_MANAGE))]
LeadsReader = Annotated[User, Depends(require_permission(Permission.LEADS_READ))]
LeadsManager = Annotated[User, Depends(require_permission(Permission.LEADS_MANAGE))]
LeadsReports = Annotated[User, Depends(require_permission(Permission.LEADS_REPORTS))]
