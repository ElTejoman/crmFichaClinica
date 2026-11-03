"""Almacenamiento de archivos clínicos en disco (fuera de la BD y fuera del webroot).

Los nombres en disco son aleatorios (nunca el nombre original) y se reparten en subcarpetas:
así un nombre malicioso no puede escapar del directorio ni adivinarse. En producción este
directorio es un volumen con copias de seguridad cifradas.
"""

import asyncio
import re
import uuid
from pathlib import Path

_KEY_PATTERN = re.compile(r"^[0-9a-f]{32}$")


class StoredFileNotFoundError(Exception):
    """El archivo referenciado en la BD no existe en disco."""


class LocalFileStorage:
    def __init__(self, root: str | Path) -> None:
        self._root = Path(root).resolve()

    @staticmethod
    def new_key() -> str:
        return uuid.uuid4().hex

    def _path(self, key: str) -> Path:
        # Defensa contra path traversal: solo claves hexadecimales de 32 caracteres.
        if not _KEY_PATTERN.match(key):
            raise ValueError("clave de archivo no válida")
        return self._root / key[:2] / key

    async def save(self, key: str, data: bytes) -> None:
        path = self._path(key)

        def _write() -> None:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)

        await asyncio.to_thread(_write)

    async def read(self, key: str) -> bytes:
        path = self._path(key)
        try:
            return await asyncio.to_thread(path.read_bytes)
        except FileNotFoundError as exc:
            raise StoredFileNotFoundError(key) from exc

    async def remove(self, key: str) -> None:
        """Solo para limpiar un archivo huérfano si el INSERT falló; no se usa para borrar datos."""
        path = self._path(key)
        await asyncio.to_thread(path.unlink, True)
