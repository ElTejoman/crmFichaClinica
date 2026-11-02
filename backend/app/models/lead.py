"""CRM: posibles clientes (leads) y su historial de actividades.

IMPORTANTE (docs/07): un lead NO tiene datos clínicos. Las notas son comerciales
(interés, precio, horario); si el contacto cuenta síntomas, eso se registra en la ficha
tras convertirse en paciente, nunca aquí.
"""

import uuid
from datetime import datetime

from sqlalchemy import ARRAY, Boolean, DateTime, ForeignKey, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin, UuidPrimaryKeyMixin


class Lead(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "leads"

    full_name: Mapped[str] = mapped_column(String(200), index=True)
    phone: Mapped[str | None] = mapped_column(String(20), index=True, default=None)
    email: Mapped[str | None] = mapped_column(String(320), index=True, default=None)
    interest_specialties: Mapped[list[str]] = mapped_column(ARRAY(String(20)), default=list)
    source: Mapped[str] = mapped_column(String(12))
    status: Mapped[str] = mapped_column(String(16), index=True)
    status_changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    # Próxima acción pendiente (denormalizada desde la última actividad registrada): permite
    # el widget "seguimientos de hoy" con una consulta simple e indexada.
    next_action_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), index=True, default=None
    )
    lost_reason: Mapped[str | None] = mapped_column(String(200), default=None)
    notes: Mapped[str | None] = mapped_column(Text, default=None)
    # Consentimiento para contacto comercial (Ley 29733): sin él no se envía publicidad.
    consent_marketing: Mapped[bool] = mapped_column(Boolean, default=False)
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id"), index=True, default=None
    )
    converted_patient_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("patients.id"), default=None
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), default=None)

    activities: Mapped[list["LeadActivity"]] = relationship(
        back_populates="lead",
        lazy="selectin",
        order_by="(LeadActivity.created_at.desc(), LeadActivity.id.desc())",
        cascade="all, delete-orphan",
    )


class LeadActivity(UuidPrimaryKeyMixin, Base):
    __tablename__ = "lead_activities"

    lead_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("leads.id"), index=True)
    type: Mapped[str] = mapped_column(String(14))
    notes: Mapped[str | None] = mapped_column(String(1000), default=None)
    # "Próxima acción": alimenta el widget de seguimientos de hoy.
    next_action_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), index=True, default=None
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    lead: Mapped[Lead] = relationship(back_populates="activities")
