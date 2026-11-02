"""Caso de uso: estado de salud del servicio."""

from app.repositories.health import HealthRepository
from app.schemas.health import ReadinessResponse


class HealthService:
    """Orquesta las comprobaciones de disponibilidad."""

    def __init__(self, repository: HealthRepository) -> None:
        self._repository = repository

    async def readiness(self) -> ReadinessResponse:
        database_ok = await self._repository.database_responds()
        return ReadinessResponse(
            status="ready" if database_ok else "degraded",
            database=database_ok,
        )
