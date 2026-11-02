"""Fixtures compartidas. Los tests de integración usan PostgreSQL real (no SQLite).

Al iniciar la sesión de tests se recrea el esquema aplicando las migraciones reales de
Alembic: así se prueban a la vez las migraciones y los triggers de auditoría.
"""

import asyncio
import os
import subprocess
import sys
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.core.config import Settings
from app.main import create_app

BACKEND_DIR = Path(__file__).resolve().parents[1]

# Base separada para no tocar datos de desarrollo.
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://clinic:clinic_dev@localhost:5432/clinic_test",
)


async def _reset_schema() -> None:
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
    await engine.dispose()


@pytest.fixture(scope="session")
def migrated_database() -> None:
    """Esquema vacío + `alembic upgrade head` (una vez por ejecución de tests)."""
    asyncio.run(_reset_schema())
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        env={**os.environ, "DATABASE_URL": TEST_DATABASE_URL},
        check=True,
    )


@pytest.fixture
def settings() -> Settings:
    return Settings(
        environment="test",
        database_url=TEST_DATABASE_URL,
        refresh_cookie_path="/",  # el cliente de test llama sin el prefijo /api
    )


@pytest.fixture
async def engine(migrated_database: None) -> AsyncIterator[AsyncEngine]:
    """Motor para que los tests manipulen la BD directamente; deja las tablas vacías."""
    eng = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    async with eng.begin() as conn:
        # El trigger bloquea TRUNCATE en audit_logs; se desactiva solo para la limpieza.
        await conn.execute(text("ALTER TABLE audit_logs DISABLE TRIGGER USER"))
        await conn.execute(
            text("TRUNCATE users, refresh_tokens, audit_logs RESTART IDENTITY CASCADE")
        )
        await conn.execute(text("ALTER TABLE audit_logs ENABLE TRIGGER USER"))
    yield eng
    await eng.dispose()


@pytest.fixture
def session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


@pytest.fixture
async def client(settings: Settings, engine: AsyncEngine) -> AsyncIterator[AsyncClient]:
    """Cliente HTTP contra la app real (ejecuta el lifespan: crea y cierra el motor)."""
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as http:
            yield http
