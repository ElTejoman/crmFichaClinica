"""Test de arquitectura: hace cumplir la regla de dependencias por capas.

Si alguien importa `models` desde un router, o FastAPI desde el dominio, este test
falla en CI. Es la forma automática de proteger el "clean code" (ver CLAUDE.md §Reglas).
"""

import ast
from pathlib import Path

import pytest

APP_DIR = Path(__file__).resolve().parents[2] / "app"

# capa -> prefijos de módulo que NO puede importar.
FORBIDDEN: dict[str, tuple[str, ...]] = {
    "api": ("app.models", "app.repositories", "sqlalchemy"),
    "services": ("app.api", "fastapi", "sqlalchemy"),
    "repositories": ("app.api", "app.services", "fastapi"),
    "domain": (
        "app.api",
        "app.services",
        "app.repositories",
        "app.models",
        "fastapi",
        "sqlalchemy",
    ),
    "schemas": ("app.api", "app.services", "app.repositories", "app.models", "sqlalchemy"),
    "models": ("app.api", "app.services", "app.repositories", "fastapi"),
}

# Excepción documentada: `api/deps.py` es la raíz de composición (cablea capas),
# por eso puede conocer repositorios y la sesión de BD.
ALLOWED_FILES = {"api/deps.py"}


def _imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            found.add(node.module)
    return found


def _violations() -> list[str]:
    problems: list[str] = []
    for layer, banned in FORBIDDEN.items():
        for file in (APP_DIR / layer).rglob("*.py"):
            relative = file.relative_to(APP_DIR).as_posix()
            if relative in ALLOWED_FILES:
                continue
            for module in _imports(file):
                if any(module == b or module.startswith(b + ".") for b in banned):
                    problems.append(f"{relative} importa '{module}' (capa '{layer}')")
    return problems


def test_layer_dependencies_are_respected() -> None:
    assert _violations() == []


@pytest.mark.parametrize("layer", sorted(FORBIDDEN))
def test_every_layer_package_exists(layer: str) -> None:
    """Evita que el test pase en vacío por un directorio renombrado."""
    assert (APP_DIR / layer).is_dir()
