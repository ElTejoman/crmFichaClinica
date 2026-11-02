"""Endpoints de salud para Docker/orquestadores y para el frontend."""

from fastapi import APIRouter, Response, status

from app.api.deps import HealthServiceDep
from app.schemas.health import LivenessResponse, ReadinessResponse

router = APIRouter(tags=["salud"])


@router.get("/health", response_model=LivenessResponse)
async def liveness() -> LivenessResponse:
    """Liveness: responde sin tocar dependencias (si falla, reiniciar el contenedor)."""
    return LivenessResponse()


@router.get("/ready", response_model=ReadinessResponse)
async def readiness(service: HealthServiceDep, response: Response) -> ReadinessResponse:
    """Readiness: 503 si la BD no responde, para que no se enrute tráfico."""
    result = await service.readiness()
    if result.status != "ready":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return result
