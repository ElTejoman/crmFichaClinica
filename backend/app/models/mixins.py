"""Mixins comunes de modelos."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column


class UuidPrimaryKeyMixin:
    """PK UUID: no revela volumen ni orden de registros (importante para pacientes/usuarios)."""

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


class TimestampMixin:
    """Marcas de tiempo en UTC gestionadas por la BD."""

    # Trae `created_at/updated_at` en el propio INSERT/UPDATE (RETURNING). Sin esto el atributo
    # queda "expirado" y leerlo al serializar fallaría (MissingGreenlet) en SQLAlchemy async.
    __mapper_args__ = {"eager_defaults": True}  # noqa: RUF012

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
