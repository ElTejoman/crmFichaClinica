"""Exporta el esquema OpenAPI a un archivo JSON.

Uso:  python scripts/export_openapi.py ../frontend/openapi.json
El frontend genera de ahí sus tipos (`npm run gen:api`) → un solo contrato (ADR-007).
"""

import json
import sys
from pathlib import Path

from app.core.config import Settings
from app.main import create_app


def main(target: str) -> None:
    app = create_app(Settings(environment="test"))
    Path(target).write_text(json.dumps(app.openapi(), indent=2, ensure_ascii=False), "utf-8")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "openapi.json")
