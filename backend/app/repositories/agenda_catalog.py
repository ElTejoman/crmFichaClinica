"""Persistencia de salas y tipos de cita."""

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agenda import AppointmentType, Room
from app.repositories.errors import UniqueViolationError


class RoomRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, **fields: Any) -> Room:
        room = Room(**fields)
        self._session.add(room)
        await _flush_unique(self._session)
        return room

    async def get(self, room_id: uuid.UUID) -> Room | None:
        return await self._session.get(Room, room_id)

    async def list_rooms(self, *, only_active: bool = True) -> list[Room]:
        statement = select(Room).order_by(Room.name)
        if only_active:
            statement = statement.where(Room.is_active.is_(True))
        return list((await self._session.execute(statement)).scalars())

    async def flush(self) -> None:
        await _flush_unique(self._session)


class AppointmentTypeRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, **fields: Any) -> AppointmentType:
        appointment_type = AppointmentType(**fields)
        self._session.add(appointment_type)
        await _flush_unique(self._session)
        return appointment_type

    async def get(self, type_id: uuid.UUID) -> AppointmentType | None:
        return await self._session.get(AppointmentType, type_id)

    async def list_types(
        self, *, specialty: str | None = None, only_active: bool = True
    ) -> list[AppointmentType]:
        statement = select(AppointmentType).order_by(
            AppointmentType.specialty, AppointmentType.name
        )
        if specialty:
            statement = statement.where(AppointmentType.specialty == specialty)
        if only_active:
            statement = statement.where(AppointmentType.is_active.is_(True))
        return list((await self._session.execute(statement)).scalars())

    async def flush(self) -> None:
        await _flush_unique(self._session)


async def _flush_unique(session: AsyncSession) -> None:
    """Traduce una violación de unicidad (nombre repetido) a un error independiente del motor."""
    try:
        await session.flush()
    except IntegrityError as exc:
        raise UniqueViolationError(str(exc.orig)) from exc
