"""Persistencia de pacientes y de la cabecera de su historia clínica."""

import uuid
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from sqlalchemy import ColumnElement, Select, func, literal_column, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.patient import CareTeamMember, ClinicalHistory, Patient
from app.repositories.errors import UniqueViolationError

# Debe coincidir EXACTAMENTE con la expresión del índice `ix_patients_full_name_trgm`
# (con literal, no parámetro) para que PostgreSQL pueda usarlo.
_FULL_NAME = func.f_unaccent(
    func.lower(Patient.first_name + literal_column("' '") + Patient.last_name)
)


@dataclass(frozen=True)
class DuplicateMatch:
    patient: Patient
    name_similarity: float
    same_birth_date: bool
    same_phone: bool


def _escape_like(text: str) -> str:
    """Neutraliza comodines de LIKE para que el texto del usuario se busque literalmente."""
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


class PatientRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, **fields: Any) -> Patient:
        patient = Patient(**fields)
        patient.clinical_history = None  # evita carga perezosa en async (ver CLAUDE.md)
        self._session.add(patient)
        try:
            await self._session.flush()
        except IntegrityError as exc:
            # Dos altas simultáneas con el mismo documento: gana una, la otra llega aquí.
            if "uq_patients_document" in str(exc.orig):
                raise UniqueViolationError("documento duplicado") from exc
            raise
        return patient

    async def open_history(
        self, patient: Patient, *, opened_at: datetime, retention_until: date
    ) -> ClinicalHistory:
        history = ClinicalHistory(
            patient_id=patient.id, opened_at=opened_at, retention_until=retention_until
        )
        self._session.add(history)
        await self._session.flush()
        await self._session.refresh(history)  # trae el hc_number generado por la secuencia
        patient.clinical_history = history
        return history

    async def get(self, patient_id: uuid.UUID) -> Patient | None:
        return await self._session.get(Patient, patient_id)

    async def get_by_document(self, document_type: str, number: str) -> Patient | None:
        result = await self._session.execute(
            select(Patient).where(
                Patient.document_type == document_type, Patient.document_number == number
            )
        )
        return result.scalar_one_or_none()

    async def search(
        self,
        *,
        query: str | None,
        limit: int,
        offset: int,
        doctor_user_id: uuid.UUID | None = None,
        include_inactive: bool = False,
    ) -> list[Patient]:
        statement: Select[Patient] = select(Patient)
        if not include_inactive:
            statement = statement.where(Patient.is_active.is_(True))
        if doctor_user_id is not None:
            statement = statement.where(Patient.id.in_(self._care_team_subquery(doctor_user_id)))
        if query and query.strip():
            statement = statement.where(self._match(query.strip()))
        statement = statement.order_by(Patient.last_name, Patient.first_name, Patient.id)
        result = await self._session.execute(statement.limit(limit).offset(offset))
        return list(result.scalars())

    @staticmethod
    def _care_team_subquery(doctor_user_id: uuid.UUID) -> Select[uuid.UUID]:
        return select(CareTeamMember.patient_id).where(
            CareTeamMember.doctor_user_id == doctor_user_id, CareTeamMember.until.is_(None)
        )

    @staticmethod
    def _match(text: str) -> ColumnElement[bool]:
        """Documento/teléfono si parece numérico; si no, nombre (substring o similar)."""
        if text.replace(" ", "").isdigit():
            digits = text.replace(" ", "")
            return or_(
                Patient.document_number.startswith(digits),
                Patient.phone.like(f"%{digits}%"),  # dígitos ya validados: sin comodines
            )
        # Se normaliza en SQL (minúsculas + sin tildes) igual que el índice. Los comodines de LIKE
        # se escapan en Python: el operador `%` de pg_trgm recibe el texto sin escapar.
        term = func.f_unaccent(func.lower(text))
        like_term = func.f_unaccent(func.lower(_escape_like(text)))
        return or_(
            _FULL_NAME.like("%" + like_term + "%", escape="\\"),
            # word_similarity (`<%`): tolera errores de tipeo en UNA palabra del nombre completo.
            term.op("<%")(_FULL_NAME),
        )

    async def find_possible_duplicates(
        self,
        *,
        first_name: str,
        last_name: str,
        birth_date: date | None,
        phone: str | None,
        min_similarity: float,
        limit: int = 5,
    ) -> list[DuplicateMatch]:
        full_name = func.f_unaccent(func.lower(f"{first_name} {last_name}"))
        similarity = func.similarity(_FULL_NAME, full_name)
        conditions: list[ColumnElement[bool]] = []
        if birth_date is not None:
            conditions.append((Patient.birth_date == birth_date) & (similarity >= min_similarity))
        if phone:
            conditions.append(Patient.phone == phone)
        if not conditions:
            return []
        result = await self._session.execute(
            select(Patient, similarity)
            .where(or_(*conditions))
            .order_by(similarity.desc())
            .limit(limit)
        )
        return [
            DuplicateMatch(
                patient=row[0],
                name_similarity=float(row[1]),
                same_birth_date=birth_date is not None and row[0].birth_date == birth_date,
                same_phone=bool(phone) and row[0].phone == phone,
            )
            for row in result.all()
        ]

    async def find_by_contact(self, *, phone: str | None, email: str | None) -> list[Patient]:
        """Pacientes que comparten teléfono o correo (para avisar al crear un lead)."""
        conditions: list[ColumnElement[bool]] = []
        if phone:
            conditions.append(Patient.phone == phone)
        if email:
            conditions.append(Patient.email == email)
        if not conditions:
            return []
        result = await self._session.execute(select(Patient).where(or_(*conditions)).limit(5))
        return list(result.scalars().all())
