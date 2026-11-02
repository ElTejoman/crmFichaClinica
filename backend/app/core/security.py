"""Primitivas criptográficas: hash de contraseñas, JWT de acceso y tokens de refresco.

Sin reglas de negocio: solo funciones puras de seguridad, fáciles de auditar.
"""

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.core.clock import utcnow

# Argon2id (parámetros por defecto de argon2-cffi, alineados con RFC 9106 "low memory").
_hasher = PasswordHasher()
# Hash de relleno: se verifica cuando el usuario no existe para igualar tiempos de respuesta
# y no revelar qué correos están registrados (enumeración de usuarios).
_DUMMY_HASH = _hasher.hash("relleno-para-igualar-tiempos")

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_TYPE = "access"  # noqa: S105  (nombre de tipo, no un secreto)
REFRESH_TOKEN_BYTES = 48


class InvalidTokenError(Exception):
    """El JWT no es válido (firma, expiración o tipo)."""


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    """Verifica en tiempo similar exista o no el usuario (`password_hash=None`)."""
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


@dataclass(frozen=True)
class AccessClaims:
    user_id: uuid.UUID
    expires_at: datetime


def create_access_token(user_id: uuid.UUID, secret: str, minutes: int) -> tuple[str, datetime]:
    """JWT corto (15 min). No incluye roles: se leen de la BD en cada petición, así un cambio
    de rol o una desactivación surten efecto de inmediato (clave en datos de salud)."""
    now = utcnow()
    expires = now + timedelta(minutes=minutes)
    payload = {
        "sub": str(user_id),
        "type": ACCESS_TOKEN_TYPE,
        "iat": now,
        "exp": expires,
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, secret, algorithm=JWT_ALGORITHM), expires


def decode_access_token(token: str, secret: str) -> AccessClaims:
    try:
        data = jwt.decode(
            token,
            secret,
            algorithms=[JWT_ALGORITHM],  # lista fija: evita "alg=none"
            options={"require": ["sub", "exp", "iat", "type"]},
        )
        if data["type"] != ACCESS_TOKEN_TYPE:
            raise InvalidTokenError("tipo de token incorrecto")
        return AccessClaims(
            user_id=uuid.UUID(data["sub"]),
            expires_at=datetime.fromtimestamp(data["exp"], tz=utcnow().tzinfo),
        )
    except (jwt.PyJWTError, ValueError) as exc:
        raise InvalidTokenError(str(exc)) from exc


def new_refresh_token() -> tuple[str, str]:
    """Devuelve `(token_en_claro, hash)`. El claro solo viaja en la cookie."""
    raw = secrets.token_urlsafe(REFRESH_TOKEN_BYTES)
    return raw, hash_refresh_token(raw)


def hash_refresh_token(raw: str) -> str:
    # SHA-256 basta: el token tiene 384 bits de entropía (no es una contraseña de humano).
    return hashlib.sha256(raw.encode()).hexdigest()
