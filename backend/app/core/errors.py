"""Errores de dominio/aplicación y su traducción a HTTP.

Los servicios lanzan estas excepciones (no conocen HTTP); un único manejador en
`main.py` las convierte en respuestas JSON uniformes. Así se mantiene la regla de capas.
"""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    """Base de errores esperados. `code` es estable para que el front lo traduzca."""

    status_code = 400
    code = "app_error"

    def __init__(self, message: str = "Error de aplicación") -> None:
        super().__init__(message)
        self.message = message


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class ConflictError(AppError):
    status_code = 409
    code = "conflict"


class PermissionDeniedError(AppError):
    status_code = 403
    code = "permission_denied"


class AuthenticationError(AppError):
    status_code = 401
    code = "not_authenticated"


def register_error_handlers(app: FastAPI) -> None:
    """Registra la traducción AppError → JSON `{error: {code, message}}`."""

    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message}},
        )
