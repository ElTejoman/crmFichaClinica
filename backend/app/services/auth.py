"""Casos de uso de autenticación: login, refresh con rotación, logout.

Decisiones de seguridad (docs/04 §4, docs/06 §2):
- Mensaje de error idéntico para "usuario inexistente" y "contraseña incorrecta".
- Bloqueo temporal tras N intentos fallidos.
- Refresh token rotativo con detección de reutilización (robo) → se revoca la familia.
- Todo evento (éxito o fallo) se audita antes de responder.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.core.clock import utcnow
from app.core.config import Settings
from app.core.errors import AuthenticationError
from app.core.security import (
    create_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    password_needs_rehash,
    verify_password,
)
from app.domain.enums import AuditAction, AuditOutcome
from app.models.user import User
from app.repositories.refresh_tokens import RefreshTokenRepository
from app.repositories.unit_of_work import UnitOfWork
from app.repositories.users import UserRepository
from app.services.audit import AuditService, RequestContext

INVALID_CREDENTIALS = "Correo o contraseña incorrectos"
ACCOUNT_LOCKED = "Cuenta bloqueada temporalmente por intentos fallidos"
INVALID_SESSION = "Sesión no válida o expirada"


@dataclass(frozen=True)
class SessionTokens:
    """Resultado de login/refresh. `refresh_token` va a la cookie; `access_token` al JSON."""

    access_token: str
    expires_in_seconds: int
    refresh_token: str
    refresh_max_age_seconds: int
    user: User


class AuthService:
    def __init__(
        self,
        *,
        users: UserRepository,
        refresh_tokens: RefreshTokenRepository,
        audit: AuditService,
        uow: UnitOfWork,
        settings: Settings,
    ) -> None:
        self._users = users
        self._refresh_tokens = refresh_tokens
        self._audit = audit
        self._uow = uow
        self._settings = settings

    # ------------------------------------------------------------------ login
    async def login(self, email: str, password: str, context: RequestContext) -> SessionTokens:
        now = utcnow()
        user = await self._users.get_by_email(email)

        if user is not None and user.locked_until and user.locked_until > now:
            await self._fail(user, "cuenta bloqueada", context)
            raise AuthenticationError(ACCOUNT_LOCKED)

        valid = verify_password(password, user.password_hash if user else None)
        if user is None or not valid or not user.is_active:
            await self._register_failure(user, context, now)
            raise AuthenticationError(INVALID_CREDENTIALS)

        user.failed_login_count = 0
        user.locked_until = None
        user.last_login_at = now
        if password_needs_rehash(user.password_hash):  # migración transparente de parámetros
            user.password_hash = hash_password(password)

        tokens = await self._issue_tokens(user, family_id=uuid.uuid4(), context=context)
        await self._audit.record(
            AuditAction.LOGIN,
            actor_user_id=user.id,
            actor_roles=user.role_names,
            resource_type="user",
            resource_id=str(user.id),
            context=context,
        )
        await self._uow.commit()
        return tokens

    async def _register_failure(
        self, user: User | None, context: RequestContext, now: datetime
    ) -> None:
        if user is not None:
            user.failed_login_count += 1
            if user.failed_login_count >= self._settings.max_failed_logins:
                user.locked_until = now + timedelta(minutes=self._settings.lockout_minutes)
                user.failed_login_count = 0
        await self._fail(user, "credenciales inválidas", context)

    async def _fail(self, user: User | None, reason: str, context: RequestContext) -> None:
        # Se confirma ANTES de lanzar el error: el intento fallido debe quedar registrado.
        await self._audit.record(
            AuditAction.LOGIN_FAILED,
            outcome=AuditOutcome.FAILURE,
            actor_user_id=user.id if user else None,
            resource_type="user",
            resource_id=str(user.id) if user else None,
            reason=reason,
            context=context,
        )
        await self._uow.commit()

    # ---------------------------------------------------------------- refresh
    async def refresh(self, raw_token: str | None, context: RequestContext) -> SessionTokens:
        if not raw_token:
            raise AuthenticationError(INVALID_SESSION)

        stored = await self._refresh_tokens.get_by_hash(hash_refresh_token(raw_token))
        if stored is None:
            raise AuthenticationError(INVALID_SESSION)

        now = utcnow()
        if stored.revoked_at is not None:
            # Un token ya rotado/revocado vuelve a usarse: posible robo → se cierra toda la familia.
            await self._refresh_tokens.revoke_family(stored.family_id, now)
            await self._audit.record(
                AuditAction.TOKEN_REUSE_DETECTED,
                outcome=AuditOutcome.DENIED,
                actor_user_id=stored.user_id,
                resource_type="user",
                resource_id=str(stored.user_id),
                reason="reutilización de refresh token",
                context=context,
            )
            await self._uow.commit()
            raise AuthenticationError(INVALID_SESSION)

        user = await self._users.get_by_id(stored.user_id)
        if stored.expires_at <= now or user is None or not user.is_active:
            raise AuthenticationError(INVALID_SESSION)

        await self._refresh_tokens.revoke(stored, now)
        tokens = await self._issue_tokens(user, family_id=stored.family_id, context=context)
        await self._audit.record(
            AuditAction.TOKEN_REFRESH,
            actor_user_id=user.id,
            actor_roles=user.role_names,
            resource_type="user",
            resource_id=str(user.id),
            context=context,
        )
        await self._uow.commit()
        return tokens

    # ----------------------------------------------------------------- logout
    async def logout(self, raw_token: str | None, context: RequestContext) -> None:
        """Idempotente: cerrar sesión sin cookie válida no es un error."""
        if not raw_token:
            return
        stored = await self._refresh_tokens.get_by_hash(hash_refresh_token(raw_token))
        if stored is None:
            return
        await self._refresh_tokens.revoke_family(stored.family_id, utcnow())
        user = await self._users.get_by_id(stored.user_id)
        await self._audit.record(
            AuditAction.LOGOUT,
            actor_user_id=stored.user_id,
            actor_roles=user.role_names if user else (),
            resource_type="user",
            resource_id=str(stored.user_id),
            context=context,
        )
        await self._uow.commit()

    # --------------------------------------------------------------- internos
    async def _issue_tokens(
        self, user: User, *, family_id: uuid.UUID, context: RequestContext
    ) -> SessionTokens:
        settings = self._settings
        access, _ = create_access_token(
            user.id, settings.jwt_secret.get_secret_value(), settings.jwt_access_minutes
        )
        raw_refresh, refresh_hash = new_refresh_token()
        max_age = int(timedelta(days=settings.jwt_refresh_days).total_seconds())
        await self._refresh_tokens.add(
            user_id=user.id,
            family_id=family_id,
            token_hash=refresh_hash,
            expires_at=utcnow() + timedelta(seconds=max_age),
            user_agent=context.user_agent,
            ip=context.ip,
        )
        return SessionTokens(
            access_token=access,
            expires_in_seconds=settings.jwt_access_minutes * 60,
            refresh_token=raw_refresh,
            refresh_max_age_seconds=max_age,
            user=user,
        )
