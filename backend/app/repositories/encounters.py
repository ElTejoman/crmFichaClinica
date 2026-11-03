"""Persistencia de encuentros clínicos, sus hijos (vitales, diagnósticos), adendas y payloads."""

import uuid
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.clinical import (
    Addendum,
    Encounter,
    EncounterDiagnosis,
    SpecialtyPayload,
    VitalSigns,
)

_RELATIONS = ["vitals", "diagnoses", "addenda", "payload", "doctor"]


class EncounterRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, **fields: Any) -> Encounter:
        encounter = Encounter(**fields)
        self._session.add(encounter)
        await self.reload(encounter)
        return encounter

    async def reload(self, encounter: Encounter) -> None:
        """Recarga las relaciones: tras escribir hijos, las cargadas quedan obsoletas."""
        await self._session.flush()
        await self._session.refresh(encounter, attribute_names=_RELATIONS)

    async def get(self, encounter_id: uuid.UUID) -> Encounter | None:
        return await self._session.get(Encounter, encounter_id)

    async def get_by_appointment(self, appointment_id: uuid.UUID) -> Encounter | None:
        result = await self._session.execute(
            select(Encounter).where(Encounter.appointment_id == appointment_id)
        )
        return result.scalar_one_or_none()

    async def list_for_patient(
        self, patient_id: uuid.UUID, *, viewer_id: uuid.UUID, limit: int, offset: int
    ) -> list[Encounter]:
        """Línea de tiempo del paciente. Un BORRADOR es trabajo en curso: solo lo ve su autor."""
        statement = (
            select(Encounter)
            .where(
                Encounter.patient_id == patient_id,
                (Encounter.status != "DRAFT") | (Encounter.doctor_user_id == viewer_id),
            )
            .order_by(Encounter.occurred_at.desc(), Encounter.id)
            .limit(limit)
            .offset(offset)
        )
        return list((await self._session.execute(statement)).scalars())

    async def latest_signed(self, patient_id: uuid.UUID) -> Encounter | None:
        result = await self._session.execute(
            select(Encounter)
            .where(Encounter.patient_id == patient_id, Encounter.status != "DRAFT")
            .order_by(Encounter.signed_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def count_signed(self, patient_id: uuid.UUID) -> int:
        result = await self._session.execute(
            select(func.count())
            .select_from(Encounter)
            .where(Encounter.patient_id == patient_id, Encounter.status != "DRAFT")
        )
        return int(result.scalar_one())

    # -------------------------------------------------------------- hijos (borrador)
    async def replace_vitals(self, encounter_id: uuid.UUID, rows: list[dict[str, Any]]) -> None:
        await self._session.execute(
            delete(VitalSigns).where(VitalSigns.encounter_id == encounter_id)
        )
        for row in rows:
            self._session.add(VitalSigns(encounter_id=encounter_id, **row))
        await self._session.flush()

    async def replace_diagnoses(self, encounter_id: uuid.UUID, rows: list[dict[str, Any]]) -> None:
        await self._session.execute(
            delete(EncounterDiagnosis).where(EncounterDiagnosis.encounter_id == encounter_id)
        )
        for row in rows:
            self._session.add(EncounterDiagnosis(encounter_id=encounter_id, **row))
        await self._session.flush()

    async def set_payload(
        self, encounter_id: uuid.UUID, *, specialty: str, schema_version: int, data: dict[str, Any]
    ) -> None:
        existing = await self._session.get(SpecialtyPayload, encounter_id)
        if existing is None:
            self._session.add(
                SpecialtyPayload(
                    encounter_id=encounter_id,
                    specialty=specialty,
                    schema_version=schema_version,
                    data=data,
                )
            )
        else:
            existing.schema_version = schema_version
            existing.data = data
        await self._session.flush()

    # ------------------------------------------------------------------- adendas
    async def add_addendum(self, **fields: Any) -> Addendum:
        addendum = Addendum(**fields)
        self._session.add(addendum)
        await self._session.flush()
        return addendum
