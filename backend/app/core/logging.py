"""Logging estructurado (JSON) con `request_id`.

REGLA DE ORO (Ley 29733): los logs NUNCA contienen datos personales ni contenido
clínico. Se registran identificadores opacos (UUID), rutas y códigos de estado.
"""

import json
import logging
import sys
from contextvars import ContextVar

# Identificador de la petición actual; permite correlacionar logs sin exponer datos.
request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")


class JsonFormatter(logging.Formatter):
    """Formatea cada registro como una línea JSON."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": request_id_ctx.get(),
        }
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(level: int = logging.INFO) -> None:
    """Configura el logger raíz una sola vez (idempotente)."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)
