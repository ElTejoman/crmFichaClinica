"""DTOs de los endpoints de salud."""

from typing import Literal

from pydantic import BaseModel


class LivenessResponse(BaseModel):
    """El proceso está vivo (no consulta dependencias)."""

    status: Literal["ok"] = "ok"


class ReadinessResponse(BaseModel):
    """El servicio puede atender tráfico (BD disponible)."""

    status: Literal["ready", "degraded"]
    database: bool
