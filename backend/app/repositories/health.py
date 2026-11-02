"""Repositorio de salud técnica: comprueba que la BD responde."""

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession


class HealthRepository:
    """Aísla el SQL de comprobación para que el servicio no conozca SQLAlchemy."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def database_responds(self) -> bool:
        """`True` si `SELECT 1` funciona; nunca propaga el error (solo informa)."""
        try:
            await self._session.execute(text("SELECT 1"))
        except SQLAlchemyError:
            return False
        return True
