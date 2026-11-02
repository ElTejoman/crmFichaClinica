"""DTOs de autenticación."""

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    # max_length evita enviar contraseñas gigantes para forzar trabajo de hashing (DoS).
    password: str = Field(min_length=1, max_length=256)


class TokenResponse(BaseModel):
    """El refresh token NO va aquí: viaja en cookie httpOnly."""

    access_token: str
    token_type: str = "bearer"  # noqa: S105  (tipo de esquema OAuth, no un secreto)
    expires_in: int = Field(description="Segundos de vida del access token")
