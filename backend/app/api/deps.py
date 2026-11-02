"""Dependencias de FastAPI (inyección). Único lugar donde se "cablean" las capas.

Aquí se construyen repositorios y servicios por petición. A partir de la Fase 1
también vivirán `get_current_user` y `require_role`.
"""

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.repositories.health import HealthRepository
from app.services.health import HealthService


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


def get_health_service(session: DbSession) -> HealthService:
    return HealthService(HealthRepository(session))


HealthServiceDep = Annotated[HealthService, Depends(get_health_service)]
