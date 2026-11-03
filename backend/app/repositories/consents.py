"""Persistencia de plantillas y consentimientos firmados."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.clinical import Consent, ConsentTemplate


class ConsentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_templates(self, *, only_active: bool = True) -> list[ConsentTemplate]:
        statement = select(ConsentTemplate).order_by(ConsentTemplate.type, ConsentTemplate.version)
        if only_active:
            statement = statement.where(ConsentTemplate.is_active.is_(True))
        return list((await self._session.execute(statement)).scalars())

    async def latest_template(self, consent_type: str) -> ConsentTemplate | None:
        result = await self._session.execute(
            select(ConsentTemplate)
            .where(ConsentTemplate.type == consent_type, ConsentTemplate.is_active.is_(True))
            .order_by(ConsentTemplate.version.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def add(self, **fields: Any) -> Consent:
        consent = Consent(**fields)
        self._session.add(consent)
        await self._session.flush()
        await self._session.refresh(consent, attribute_names=["template"])
        return consent

    async def get(self, consent_id: uuid.UUID) -> Consent | None:
        return await self._session.get(Consent, consent_id)

    async def list_for_patient(self, patient_id: uuid.UUID) -> list[Consent]:
        result = await self._session.execute(
            select(Consent)
            .where(Consent.patient_id == patient_id)
            .order_by(Consent.signed_at.desc())
        )
        return list(result.scalars())

    async def valid_types(self, patient_id: uuid.UUID) -> set[str]:
        """Tipos de consentimiento vigentes (firmados y no revocados)."""
        result = await self._session.execute(
            select(Consent.type).where(
                Consent.patient_id == patient_id, Consent.revoked_at.is_(None)
            )
        )
        return {row[0] for row in result.all()}

    async def revoke(self, consent: Consent, *, at: datetime, reason: str, by: uuid.UUID) -> None:
        consent.revoked_at = at
        consent.revoked_reason = reason
        consent.revoked_by = by
        await self._session.flush()
