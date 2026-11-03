"""Configuración centralizada de la aplicación.

Toda configuración proviene de variables de entorno (o `.env` en desarrollo).
Nunca se escriben secretos en el código: ver `.env.example`.
"""

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.domain.clinic import CLINIC_TIMEZONE

__all__ = ["CLINIC_TIMEZONE", "Settings", "get_settings"]


class Settings(BaseSettings):
    """Ajustes tipados; falla al arrancar si falta algo obligatorio."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"
    app_name: str = "CRM Clínica API"

    # --- Base de datos -------------------------------------------------
    database_url: str = Field(
        default="postgresql+asyncpg://clinic:clinic_dev@localhost:5432/clinic",
        description="URL async de SQLAlchemy (driver asyncpg).",
    )

    # --- Seguridad -----------------------------------------------------
    # El valor por defecto SOLO sirve en desarrollo; en producción se exige uno propio.
    jwt_secret: SecretStr = SecretStr("dev-only-change-me-dev-only-change-me")
    jwt_access_minutes: int = 15
    jwt_refresh_days: int = 7

    # Cookie del refresh token: httpOnly (JS no la lee → mitiga XSS) y SameSite=Strict
    # (mitiga CSRF).
    # El navegador ve la API bajo `/api` (proxy Vite/Nginx), por eso ese es el path por defecto.
    refresh_cookie_name: str = "refresh_token"
    refresh_cookie_path: str = "/api/auth"
    refresh_cookie_secure: bool | None = None  # None → True solo en producción

    # Bloqueo progresivo ante fuerza bruta (docs/04 §4).
    max_failed_logins: int = 5
    lockout_minutes: int = 15

    # --- Archivos clínicos (adjuntos) -----------------------------------
    # Directorio FUERA del webroot; en Docker es un volumen. Ver docs/06 §2.
    storage_dir: str = "storage"

    # --- CORS ----------------------------------------------------------
    cors_origins: list[str] = ["http://localhost:5173"]

    # --- Normativa (parámetros configurables, ver docs/01 [VERIFICAR]) ---
    retention_years: int = 20

    @property
    def cookie_secure(self) -> bool:
        """Cookie `Secure` salvo en desarrollo/test (http://localhost no soporta Secure)."""
        if self.refresh_cookie_secure is not None:
            return self.refresh_cookie_secure
        return self.environment == "production"

    def assert_safe_for_production(self) -> None:
        """Evita desplegar con secretos de desarrollo (riesgo de datos de salud)."""
        if self.environment == "production" and self.jwt_secret.get_secret_value().startswith(
            "dev-only"
        ):
            raise RuntimeError("JWT_SECRET de desarrollo no permitido en producción")


@lru_cache
def get_settings() -> Settings:
    """Instancia única (cacheada) de la configuración."""
    return Settings()
