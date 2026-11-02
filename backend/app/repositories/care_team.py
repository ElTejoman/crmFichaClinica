"""Persistencia de la relación terapéutica doctor↔paciente."""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.patient import CareTeamMember


class CareTeamRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(
        self,
        *,
        patient_id: uuid.UUID,
        doctor_user_id: uuid.UUID,
        since: datetime,
        created_by: uuid.UUID,
    ) -> CareTeamMember:
        member = CareTeamMember(
            patient_id=patient_id,
            doctor_user_id=doctor_user_id,
            since=since,
            created_by=created_by,
        )
        self._session.add(member)
        await self._session.flush()
        return member

    async def get_active(
        self, patient_id: uuid.UUID, doctor_user_id: uuid.UUID
    ) -> CareTeamMember | None:
        result = await self._session.execute(
            select(CareTeamMember).where(
                CareTeamMember.patient_id == patient_id,
                CareTeamMember.doctor_user_id == doctor_user_id,
                CareTeamMember.until.is_(None),
            )
        )
        return result.scalar_one_or_none()

    async def is_active_member(self, patient_id: uuid.UUID, doctor_user_id: uuid.UUID) -> bool:
        return await self.get_active(patient_id, doctor_user_id) is not None

    async def end(self, member: CareTeamMember, at: datetime) -> None:
        member.until = at
        await self._session.flush()

    async def list_for_patient(self, patient_id: uuid.UUID) -> list[CareTeamMember]:
        result = await self._session.execute(
            select(CareTeamMember)
            .where(CareTeamMember.patient_id == patient_id)
            .order_by(CareTeamMember.since.desc())
        )
        return list(result.scalars().all())
