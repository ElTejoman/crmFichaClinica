"""Punto de entrada de la API: fábrica de la aplicación FastAPI."""

import logging
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import Settings, get_settings
from app.core.database import build_engine, build_session_factory
from app.core.errors import register_error_handlers
from app.core.logging import configure_logging, request_id_ctx

logger = logging.getLogger(__name__)

REQUEST_ID_HEADER = "X-Request-ID"


def create_app(settings: Settings | None = None) -> FastAPI:
    """Construye la app. Recibir `settings` facilita los tests (inyección explícita)."""
    settings = settings or get_settings()
    settings.assert_safe_for_production()
    configure_logging()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = build_engine(settings.database_url)
        app.state.engine = engine
        app.state.session_factory = build_session_factory(engine)
        logger.info("API iniciada (%s)", settings.environment)
        yield
        await engine.dispose()

    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        lifespan=lifespan,
        # La documentación interactiva se oculta en producción (reduce superficie de ataque).
        docs_url=None if settings.environment == "production" else "/docs",
        redoc_url=None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,  # necesario para la cookie httpOnly del refresh token
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def request_id_middleware(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        """Asigna un ID a cada petición y lo devuelve en cabecera (correlación sin PII)."""
        request_id = request.headers.get(REQUEST_ID_HEADER) or uuid.uuid4().hex
        token = request_id_ctx.set(request_id)
        try:
            response = await call_next(request)
        finally:
            request_id_ctx.reset(token)
        response.headers[REQUEST_ID_HEADER] = request_id
        return response

    register_error_handlers(app)
    app.include_router(api_router)
    return app


app = create_app()
