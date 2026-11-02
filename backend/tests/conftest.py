"""Fixtures compartidas. Los tests de integración usan PostgreSQL real (no SQLite)."""

import os
from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.main import create_app

# Base separada para no tocar datos de desarrollo.
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://clinic:clinic_dev@localhost:5432/clinic_test",
)


@pytest.fixture
def settings() -> Settings:
    return Settings(environment="test", database_url=TEST_DATABASE_URL)


@pytest.fixture
async def client(settings: Settings) -> AsyncIterator[AsyncClient]:
    """Cliente HTTP contra la app real (ejecuta el lifespan: crea y cierra el motor)."""
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as http:
            yield http
