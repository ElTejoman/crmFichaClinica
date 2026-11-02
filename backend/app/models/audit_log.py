"""Registro de auditoría append-only con hash encadenado (docs/06 §3)."""

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Identity, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AuditLog(Base):
    """Cada fila es inmutable: un trigger de BD rechaza UPDATE/DELETE/TRUNCATE."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, index=True, default=None)
    actor_roles: Mapped[str | None] = mapped_column(String(120), default=None)
    action: Mapped[str] = mapped_column(String(32), index=True)
    resource_type: Mapped[str | None] = mapped_column(String(40), default=None)
    resource_id: Mapped[str | None] = mapped_column(String(64), default=None)
    # Paciente afectado: permite mostrarle "quién accedió a mi historia" (Ley 29733).
    patient_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, index=True, default=None)
    ip: Mapped[str | None] = mapped_column(String(45), default=None)
    user_agent: Mapped[str | None] = mapped_column(String(300), default=None)
    outcome: Mapped[str] = mapped_column(String(10))
    reason: Mapped[str | None] = mapped_column(String(300), default=None)
    prev_hash: Mapped[str] = mapped_column(String(64))
    row_hash: Mapped[str] = mapped_column(String(64), unique=True)
