"""Persistencia de metadatos de adjuntos (el archivo está en `LocalFileStorage`)."""

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.clinical import Attachment


class AttachmentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, **fields: Any) -> Attachment:
        attachment = Attachment(**fields)
        self._session.add(attachment)
        await self._session.flush()
        await self._session.refresh(attachment)  # created_at (server_default)
        return attachment

    async def get(self, attachment_id: uuid.UUID) -> Attachment | None:
        return await self._session.get(Attachment, attachment_id)

    async def list_for_patient(self, patient_id: uuid.UUID) -> list[Attachment]:
        result = await self._session.execute(
            select(Attachment)
            .where(Attachment.patient_id == patient_id)
            .order_by(Attachment.created_at.desc())
        )
        return list(result.scalars())
