"""Persistencia de horarios laborales y excepciones (vacaciones, feriados)."""

import uuid
from collections.abc import Sequence
from datetime import date
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agenda import DoctorSchedule, ScheduleException


class ScheduleRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ------------------------------------------------------------------ bloques
    async def add_block(self, **fields: Any) -> DoctorSchedule:
        block = DoctorSchedule(**fields)
        self._session.add(block)
        await self.reload_block(block)
        return block

    async def reload_block(self, block: DoctorSchedule) -> None:
        """Recarga el doctor asociado (la relación no está cargada en un objeto nuevo)."""
        await self._session.flush()
        await self._session.refresh(block, attribute_names=["doctor"])

    async def get_block(self, block_id: uuid.UUID) -> DoctorSchedule | None:
        return await self._session.get(DoctorSchedule, block_id)

    async def list_blocks(
        self, *, doctor_user_ids: Sequence[uuid.UUID] | None = None, only_active: bool = True
    ) -> list[DoctorSchedule]:
        statement = select(DoctorSchedule)
        if doctor_user_ids is not None:
            statement = statement.where(DoctorSchedule.doctor_user_id.in_(doctor_user_ids))
        if only_active:
            statement = statement.where(DoctorSchedule.is_active.is_(True))
        result = await self._session.execute(
            statement.order_by(DoctorSchedule.weekday, DoctorSchedule.start_time)
        )
        return list(result.scalars())

    # -------------------------------------------------------------- excepciones
    async def add_exception(self, **fields: Any) -> ScheduleException:
        exception = ScheduleException(**fields)
        self._session.add(exception)
        await self._session.flush()
        await self._session.refresh(exception, attribute_names=["doctor"])
        return exception

    async def get_exception(self, exception_id: uuid.UUID) -> ScheduleException | None:
        return await self._session.get(ScheduleException, exception_id)

    async def delete_exception(self, exception: ScheduleException) -> None:
        """Borrado físico permitido: es configuración, no un registro clínico."""
        await self._session.delete(exception)
        await self._session.flush()

    async def list_exceptions(
        self,
        *,
        doctor_user_id: uuid.UUID | None = None,
        from_date: date | None = None,
        to_date: date | None = None,
    ) -> list[ScheduleException]:
        statement = select(ScheduleException)
        if doctor_user_id is not None:
            # Las de la clínica entera (doctor NULL) también afectan a este doctor.
            statement = statement.where(
                or_(
                    ScheduleException.doctor_user_id == doctor_user_id,
                    ScheduleException.doctor_user_id.is_(None),
                )
            )
        if from_date is not None:
            statement = statement.where(ScheduleException.end_date >= from_date)
        if to_date is not None:
            statement = statement.where(ScheduleException.start_date <= to_date)
        result = await self._session.execute(statement.order_by(ScheduleException.start_date))
        return list(result.scalars())
