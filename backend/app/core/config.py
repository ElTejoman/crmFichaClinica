"""Configuración centralizada de la aplicación.

Toda configuración proviene de variables de entorno (o `.env` en desarrollo).
Nunca se escriben secretos en el código: ver `.env.example`.
"""

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

# Zona horaria de presentación de la clínica. La BD siempre guarda UTC (ADR-008).
CLINIC_TIMEZONE = "America/Lima"


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

    # --- CORS ----------------------------------------------------------
    cors_origins: list[str] = ["http://localhost:5173"]

    # --- Normativa (parámetros configurables, ver docs/01 [VERIFICAR]) ---
    retention_years: int = 20

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
