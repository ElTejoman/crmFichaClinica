from datetime import UTC, datetime, timedelta, timezone

from app.domain.audit_chain import (
    GENESIS_HASH,
    canonical_timestamp,
    compute_row_hash,
    first_broken_index,
)


def _build_chain(n: int) -> list[tuple[str, str, dict[str, object]]]:
    rows: list[tuple[str, str, dict[str, object]]] = []
    prev = GENESIS_HASH
    for i in range(n):
        content: dict[str, object] = {"action": "READ", "n": i}
        row_hash = compute_row_hash(prev, content)
        rows.append((prev, row_hash, content))
        prev = row_hash
    return rows


def test_hash_is_deterministic_and_order_independent() -> None:
    a = compute_row_hash(GENESIS_HASH, {"x": 1, "y": 2})
    b = compute_row_hash(GENESIS_HASH, {"y": 2, "x": 1})
    assert a == b and len(a) == 64


def test_valid_chain_has_no_broken_index() -> None:
    assert first_broken_index(_build_chain(5)) is None
    assert first_broken_index([]) is None


def test_modified_content_is_detected() -> None:
    chain = _build_chain(5)
    prev, row_hash, content = chain[2]
    chain[2] = (prev, row_hash, {**content, "action": "EXPORT"})
    assert first_broken_index(chain) == 2


def test_deleted_row_is_detected() -> None:
    chain = _build_chain(5)
    del chain[1]
    assert first_broken_index(chain) == 1


def test_canonical_timestamp_is_timezone_independent() -> None:
    utc = datetime(2026, 11, 2, 12, 0, 0, 123456, tzinfo=UTC)
    lima = utc.astimezone(timezone(timedelta(hours=-5)))
    assert canonical_timestamp(utc) == canonical_timestamp(lima)
