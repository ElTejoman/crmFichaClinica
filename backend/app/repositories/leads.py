"""Persistencia del CRM: leads, actividades y estadísticas."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import ColumnElement, Select, any_, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.domain.enums import LeadStatus
from app.domain.lead_funnel import OPEN_STATUSES
from app.models.lead import Lead, LeadActivity


class LeadRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, **fields: Any) -> Lead:
        lead = Lead(**fields)
        lead.activities = []  # inicializa la relación (async no permite carga perezosa)
        self._session.add(lead)
        await self._session.flush()
        return lead

    async def get(self, lead_id: uuid.UUID) -> Lead | None:
        return await self._session.get(Lead, lead_id)

    async def add_activity(
        self,
        lead: Lead,
        *,
        type_: str,
        notes: str | None,
        next_action_at: datetime | None,
        created_by: uuid.UUID,
    ) -> LeadActivity:
        activity = LeadActivity(
            lead_id=lead.id,
            type=type_,
            notes=notes,
            next_action_at=next_action_at,
            created_by=created_by,
            # Hora fijada aquí, no por `now()` de la BD: `now()` es la hora de INICIO de la
            # transacción, y varias actividades creadas juntas quedarían empatadas.
            created_at=utcnow(),
        )
        self._session.add(activity)
        await self._session.flush()
        await self._session.refresh(lead, attribute_names=["activities"])
        return activity

    def _filtered(
        self,
        *,
        status: str | None,
        source: str | None,
        assigned_to: uuid.UUID | None,
        specialty: str | None,
        query: str | None,
        restrict_assigned_to: uuid.UUID | None,
    ) -> Select[Lead]:
        statement = select(Lead)
        if status:
            statement = statement.where(Lead.status == status)
        if source:
            statement = statement.where(Lead.source == source)
        if assigned_to:
            statement = statement.where(Lead.assigned_to == assigned_to)
        if restrict_assigned_to:  # un doctor solo ve los leads que se le asignaron
            statement = statement.where(Lead.assigned_to == restrict_assigned_to)
        if specialty:
            statement = statement.where(literal(specialty) == any_(Lead.interest_specialties))
        if query and query.strip():
            text = query.strip()
            name_match = func.f_unaccent(func.lower(Lead.full_name)).like(
                "%" + func.f_unaccent(func.lower(_escape(text))) + "%", escape="\\"
            )
            conditions: list[ColumnElement[bool]] = [name_match]
            digits = "".join(c for c in text if c.isdigit())
            if digits:
                conditions.append(Lead.phone.like(f"%{digits}%"))
            statement = statement.where(or_(*conditions))
        return statement

    async def list_leads(
        self,
        *,
        limit: int,
        offset: int,
        status: str | None = None,
        source: str | None = None,
        assigned_to: uuid.UUID | None = None,
        specialty: str | None = None,
        query: str | None = None,
        restrict_assigned_to: uuid.UUID | None = None,
    ) -> list[Lead]:
        statement = self._filtered(
            status=status,
            source=source,
            assigned_to=assigned_to,
            specialty=specialty,
            query=query,
            restrict_assigned_to=restrict_assigned_to,
        )
        result = await self._session.execute(
            statement.order_by(Lead.updated_at.desc(), Lead.id).limit(limit).offset(offset)
        )
        return list(result.scalars().all())

    async def due_followups(
        self, *, due_before: datetime, restrict_assigned_to: uuid.UUID | None
    ) -> list[Lead]:
        """Leads abiertos cuya próxima acción vence a más tardar en `due_before`."""
        statement = select(Lead).where(
            Lead.next_action_at.is_not(None),
            Lead.next_action_at <= due_before,
            Lead.status.in_([s.value for s in OPEN_STATUSES]),
        )
        if restrict_assigned_to:
            statement = statement.where(Lead.assigned_to == restrict_assigned_to)
        result = await self._session.execute(statement.order_by(Lead.next_action_at))
        return list(result.scalars().all())

    async def find_duplicates(
        self, *, phone: str | None, email: str | None, exclude_id: uuid.UUID | None = None
    ) -> list[Lead]:
        conditions: list[ColumnElement[bool]] = []
        if phone:
            conditions.append(Lead.phone == phone)
        if email:
            conditions.append(Lead.email == email)
        if not conditions:
            return []
        statement = select(Lead).where(or_(*conditions))
        if exclude_id:
            statement = statement.where(Lead.id != exclude_id)
        result = await self._session.execute(statement.limit(5))
        return list(result.scalars().all())

    async def counts_by(self, column: str) -> dict[str, int]:
        """Conteo agrupado por una columna escalar (`status`, `source`, `lost_reason`)."""
        col = getattr(Lead, column)
        result = await self._session.execute(select(col, func.count()).group_by(col))
        return {str(key): count for key, count in result.all() if key is not None}

    async def counts_by_specialty(self) -> dict[str, int]:
        specialty = func.unnest(Lead.interest_specialties).label("specialty")
        subquery = select(specialty).subquery()
        result = await self._session.execute(
            select(subquery.c.specialty, func.count()).group_by(subquery.c.specialty)
        )
        return {str(key): count for key, count in result.all()}

    async def count_open(self) -> int:
        result = await self._session.execute(
            select(func.count())
            .select_from(Lead)
            .where(Lead.status.in_([s.value for s in OPEN_STATUSES]))
        )
        return int(result.scalar_one())

    async def count_status(self, status: LeadStatus) -> int:
        result = await self._session.execute(
            select(func.count()).select_from(Lead).where(Lead.status == status.value)
        )
        return int(result.scalar_one())


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
