"""Cadena de hash de la auditoría (ADR-004). Lógica pura y verificable.

Cada fila guarda `row_hash = SHA256(prev_hash || contenido_canónico)`. Alterar o borrar
una fila rompe la cadena desde ese punto, lo que `first_broken_index` detecta.
Esto es *evidencia de manipulación*, complementa (no reemplaza) el bloqueo por trigger en BD.
"""

import hashlib
import json
from collections.abc import Iterable, Mapping
from datetime import UTC, datetime
from typing import Any

GENESIS_HASH = "0" * 64


def canonical_timestamp(ts: datetime) -> str:
    """Formato único (UTC, microsegundos) para que el hash sea reproducible tras ir a BD."""
    return ts.astimezone(UTC).isoformat(timespec="microseconds")


def compute_row_hash(prev_hash: str, content: Mapping[str, Any]) -> str:
    """Hash determinista: JSON ordenado y sin espacios para evitar ambigüedades."""
    canonical = json.dumps(content, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(f"{prev_hash}|{canonical}".encode()).hexdigest()


def first_broken_index(rows: Iterable[tuple[str, str, Mapping[str, Any]]]) -> int | None:
    """Recorre `(prev_hash, row_hash, contenido)` en orden y devuelve el índice roto, o None.

    Comprueba (1) que cada `prev_hash` enlaza con el `row_hash` anterior y (2) que el
    `row_hash` guardado coincide con el recalculado.
    """
    expected_prev = GENESIS_HASH
    for index, (prev_hash, row_hash, content) in enumerate(rows):
        if prev_hash != expected_prev or compute_row_hash(prev_hash, content) != row_hash:
            return index
        expected_prev = row_hash
    return None
