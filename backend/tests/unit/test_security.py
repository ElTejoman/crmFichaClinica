import uuid
from datetime import timedelta

import jwt
import pytest

from app.core import security
from app.core.clock import utcnow
from app.core.security import (
    InvalidTokenError,
    create_access_token,
    decode_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    verify_password,
)

SECRET = "x" * 48


def test_password_hash_roundtrip_and_is_salted() -> None:
    h1, h2 = hash_password("Clave-Segura-2026"), hash_password("Clave-Segura-2026")
    assert h1 != h2 and h1.startswith("$argon2id$")
    assert verify_password("Clave-Segura-2026", h1)
    assert not verify_password("otra-clave", h1)


def test_verify_password_for_unknown_user_is_false() -> None:
    assert verify_password("loquesea", None) is False


def test_access_token_roundtrip() -> None:
    user_id = uuid.uuid4()
    token, _ = create_access_token(user_id, SECRET, minutes=15)
    assert decode_access_token(token, SECRET).user_id == user_id


def test_wrong_secret_is_rejected() -> None:
    token, _ = create_access_token(uuid.uuid4(), SECRET, minutes=15)
    with pytest.raises(InvalidTokenError):
        decode_access_token(token, "y" * 48)


def test_expired_token_is_rejected() -> None:
    token, _ = create_access_token(uuid.uuid4(), SECRET, minutes=-1)
    with pytest.raises(InvalidTokenError):
        decode_access_token(token, SECRET)


def test_unsigned_alg_none_token_is_rejected() -> None:
    now = utcnow()
    forged = jwt.encode(
        {"sub": str(uuid.uuid4()), "type": "access", "iat": now, "exp": now + timedelta(hours=1)},
        key="",
        algorithm="none",
    )
    with pytest.raises(InvalidTokenError):
        decode_access_token(forged, SECRET)


def test_refresh_token_type_is_not_accepted_as_access() -> None:
    now = utcnow()
    other = jwt.encode(
        {"sub": str(uuid.uuid4()), "type": "refresh", "iat": now, "exp": now + timedelta(hours=1)},
        SECRET,
        algorithm=security.JWT_ALGORITHM,
    )
    with pytest.raises(InvalidTokenError):
        decode_access_token(other, SECRET)


def test_refresh_token_is_random_and_only_hash_is_derivable() -> None:
    raw1, hash1 = new_refresh_token()
    raw2, _ = new_refresh_token()
    assert raw1 != raw2 and hash_refresh_token(raw1) == hash1 and raw1 != hash1
