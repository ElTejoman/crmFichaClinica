"""baseline: extensiones de PostgreSQL requeridas por el diseño

Revision ID: 0001
Revises:
Create Date: 2026-11-02

- pg_trgm:   búsqueda difusa de pacientes/CIE-10 y detección de duplicados.
- btree_gist: permite constraints de exclusión (citas sin solapamiento por
              doctor/sala combinando igualdad + rangos `tstzrange`).
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS btree_gist")
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
