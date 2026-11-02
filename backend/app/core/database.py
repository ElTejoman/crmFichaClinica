"""Infraestructura de base de datos (SQLAlchemy 2.0 async).

Capa `core`: no contiene reglas de negocio. Los repositorios reciben una
`AsyncSession` por inyección de dependencias.
"""

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings


class Base(DeclarativeBase):
    """Clase base declarativa de todos los modelos."""


def build_engine(url: str | None = None) -> AsyncEngine:
    """Crea el motor. `pool_pre_ping` evita conexiones muertas tras reinicios de la BD."""
    return create_async_engine(url or get_settings().database_url, pool_pre_ping=True)


def build_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """`expire_on_commit=False` permite serializar objetos tras el commit sin recargar."""
    return async_sessionmaker(engine, expire_on_commit=False)
