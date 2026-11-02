"""Unidad de trabajo: una transacción por caso de uso.

Los servicios no conocen SQLAlchemy; deciden *cuándo* confirmar mediante este objeto.
Importante para auditoría: un intento fallido (p. ej. login incorrecto) debe quedar
registrado aunque el caso de uso termine en error, por eso se confirma antes de lanzar.
"""

from sqlalchemy.ext.asyncio import AsyncSession


class UnitOfWork:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def commit(self) -> None:
        await self._session.commit()

    async def rollback(self) -> None:
        await self._session.rollback()
