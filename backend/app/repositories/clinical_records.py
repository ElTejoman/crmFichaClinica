"""Persistencia de alergias, medicación, antecedentes y del catálogo CIE-10."""

import uuid
from typing import Any

from sqlalchemy import ColumnElement, func, literal_column, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.clinical import Allergy, Condition, Icd10Code, Medication

_SEARCH_TEXT = func.f_unaccent(
    func.lower(Icd10Code.code + literal_column("' '") + Icd10Code.description)
)


class ClinicalRecordRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ---------------------------------------------------------------- alergias
    async def add_allergy(self, **fields: Any) -> Allergy:
        allergy = Allergy(**fields)
        self._session.add(allergy)
        await self._session.flush()
        return allergy

    async def get_allergy(self, allergy_id: uuid.UUID) -> Allergy | None:
        return await self._session.get(Allergy, allergy_id)

    async def list_allergies(self, patient_id: uuid.UUID, *, only_active: bool) -> list[Allergy]:
        statement = select(Allergy).where(Allergy.patient_id == patient_id)
        if only_active:
            statement = statement.where(Allergy.status == "ACTIVE")
        # Las graves primero: es lo que debe verse arriba en la alerta.
        severity_order = func.array_position(["SEVERE", "MODERATE", "MILD"], Allergy.severity)
        result = await self._session.execute(statement.order_by(severity_order, Allergy.substance))
        return list(result.scalars())

    # ------------------------------------------------------------- medicación
    async def add_medication(self, **fields: Any) -> Medication:
        medication = Medication(**fields)
        self._session.add(medication)
        await self._session.flush()
        return medication

    async def get_medication(self, medication_id: uuid.UUID) -> Medication | None:
        return await self._session.get(Medication, medication_id)

    async def list_medications(
        self, patient_id: uuid.UUID, *, only_active: bool
    ) -> list[Medication]:
        statement = select(Medication).where(Medication.patient_id == patient_id)
        if only_active:
            statement = statement.where(Medication.status == "ACTIVE")
        result = await self._session.execute(statement.order_by(Medication.name))
        return list(result.scalars())

    # ------------------------------------------------------------ antecedentes
    async def add_condition(self, **fields: Any) -> Condition:
        condition = Condition(**fields)
        self._session.add(condition)
        await self._session.flush()
        return condition

    async def get_condition(self, condition_id: uuid.UUID) -> Condition | None:
        return await self._session.get(Condition, condition_id)

    async def list_conditions(self, patient_id: uuid.UUID, *, only_active: bool) -> list[Condition]:
        statement = select(Condition).where(Condition.patient_id == patient_id)
        if only_active:
            statement = statement.where(Condition.active.is_(True))
        result = await self._session.execute(
            statement.order_by(Condition.kind, Condition.description)
        )
        return list(result.scalars())

    async def flush(self) -> None:
        await self._session.flush()

    # ------------------------------------------------------------------ CIE-10
    async def get_icd10(self, code: str) -> Icd10Code | None:
        return await self._session.get(Icd10Code, code)

    async def search_icd10(self, query: str, *, limit: int) -> list[Icd10Code]:
        """Por código (prefijo) o por texto sin tildes con tolerancia a erratas."""
        text = query.strip()
        escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        is_code = len(text) >= 1 and text[0].isalpha() and any(c.isdigit() for c in text[:3])
        condition: ColumnElement[bool]
        if is_code:
            # "m545" debe encontrar "M54.5": se comparan ambos sin el punto.
            bare = escaped.replace(".", "")
            condition = func.replace(Icd10Code.code, ".", "").ilike(f"{bare}%", escape="\\")
        else:
            term = func.f_unaccent(func.lower(text))
            like_term = func.f_unaccent(func.lower(escaped))
            condition = or_(
                _SEARCH_TEXT.like("%" + like_term + "%", escape="\\"),
                term.op("<%")(_SEARCH_TEXT),
            )
        result = await self._session.execute(
            select(Icd10Code).where(condition).order_by(Icd10Code.code).limit(limit)
        )
        return list(result.scalars())
