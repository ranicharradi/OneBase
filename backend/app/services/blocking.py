"""Blocking — candidate pair generation scoped to a single record type."""

import logging
import math
import random
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.config import settings
from app.models.staging import StagedRecord
from app.models.unified import UnifiedRecord
from app.services.record_set import RecordRef, RecordSet

logger = logging.getLogger(__name__)


@dataclass
class _BlockingRow:
    ref: RecordRef
    data_source_id: int | None  # None for unified
    normalized_name: str | None
    embedding: object | None  # Vector or None


def _load_rows(db: Session, rs: RecordSet) -> list[_BlockingRow]:
    out: list[_BlockingRow] = []
    by_kind = rs.ids_by_kind
    if by_kind["staged"]:
        rows = db.query(StagedRecord).filter(StagedRecord.id.in_(by_kind["staged"])).all()
        for r in rows:
            out.append(
                _BlockingRow(
                    ref=RecordRef(r.id, "staged"),
                    data_source_id=r.data_source_id,
                    normalized_name=r.normalized_name,
                    embedding=r.name_embedding,
                )
            )
    if by_kind["unified"]:
        rows = db.query(UnifiedRecord).filter(UnifiedRecord.id.in_(by_kind["unified"])).all()
        for r in rows:
            out.append(
                _BlockingRow(
                    ref=RecordRef(r.id, "unified"),
                    data_source_id=None,
                    normalized_name=r.normalized_name,
                    embedding=r.name_embedding,
                )
            )
    return out


def _representative_filter(rows: list[_BlockingRow], representative_ids: set[RecordRef] | None) -> list[_BlockingRow]:
    if representative_ids is None:
        return rows
    return [r for r in rows if r.ref in representative_ids]


def _bucket(rows: list[_BlockingRow]) -> tuple[dict, dict]:
    prefix_buckets: dict[str, list[_BlockingRow]] = defaultdict(list)
    token_buckets: dict[str, list[_BlockingRow]] = defaultdict(list)
    for r in rows:
        if not r.normalized_name:
            continue
        name = r.normalized_name.strip()
        if not name:
            continue
        if len(name) >= 3:
            prefix_buckets[name[:3]].append(r)
        toks = name.split()
        if toks:
            token_buckets[toks[0]].append(r)
    return prefix_buckets, token_buckets


def _emit_pairs(
    bucket_rows: Iterable[_BlockingRow],
    side_b_refs: set[RecordRef] | None,
    pairs: set[tuple[RecordRef, RecordRef]],
    rng: random.Random,
    max_bucket_pairs: int,
) -> None:
    """For a single bucket, add all valid pairs.

    - If side_b_refs is None: same-side, must be different data_source_id (cross-source).
    - If side_b_refs is given: pair must have exactly one ref from each side.
    """
    bucket_list = list(bucket_rows)
    if side_b_refs is None:
        by_source: dict[int, list[_BlockingRow]] = defaultdict(list)
        for r in bucket_list:
            if r.data_source_id is None:
                continue  # unified rows never appear in single-side mode
            by_source[r.data_source_id].append(r)
        source_lists = list(by_source.values())
        for i in range(len(source_lists)):
            for j in range(i + 1, len(source_lists)):
                a, b = source_lists[i], source_lists[j]
                if len(a) * len(b) > max_bucket_pairs:
                    k = max(1, math.isqrt(max_bucket_pairs))
                    a = rng.sample(a, min(k, len(a)))
                    b = rng.sample(b, min(k, len(b)))
                for ra in a:
                    for rb in b:
                        pairs.add(_ordered(ra.ref, rb.ref))
    else:
        side_a_rows = [r for r in bucket_list if r.ref not in side_b_refs]
        side_b_rows = [r for r in bucket_list if r.ref in side_b_refs]
        if len(side_a_rows) * len(side_b_rows) > max_bucket_pairs:
            k = max(1, math.isqrt(max_bucket_pairs))
            side_a_rows = rng.sample(side_a_rows, min(k, len(side_a_rows)))
            side_b_rows = rng.sample(side_b_rows, min(k, len(side_b_rows)))
        for ra in side_a_rows:
            for rb in side_b_rows:
                pairs.add(_ordered(ra.ref, rb.ref))


def _ordered(a: RecordRef, b: RecordRef) -> tuple[RecordRef, RecordRef]:
    """Canonical ordering: staged before unified; within same kind, lower id first."""
    if a.kind == b.kind:
        return (a, b) if a.id <= b.id else (b, a)
    return (a, b) if a.kind == "staged" else (b, a)


def text_block(
    db: Session,
    side_a: RecordSet,
    side_b: RecordSet | None,
    representative_ids: set[RecordRef] | None = None,
) -> set[tuple[RecordRef, RecordRef]]:
    if side_b is not None and side_a.type_key != side_b.type_key:
        raise ValueError(f"type mismatch: {side_a.type_key!r} vs {side_b.type_key!r}")

    combined = list(side_a.refs)
    side_b_refs: set[RecordRef] | None = None
    if side_b is not None:
        combined.extend(side_b.refs)
        side_b_refs = set(side_b.refs)

    rs_combined = RecordSet(type_key=side_a.type_key, refs=combined)
    rows = _load_rows(db, rs_combined)
    rows = _representative_filter(rows, representative_ids)

    prefix_buckets, token_buckets = _bucket(rows)
    pairs: set[tuple[RecordRef, RecordRef]] = set()
    rng = random.Random(42)  # noqa: S311 — deterministic subsampling
    max_bucket_pairs = settings.matching_max_bucket_pairs

    for bucket in prefix_buckets.values():
        _emit_pairs(bucket, side_b_refs, pairs, rng, max_bucket_pairs)
    for bucket in token_buckets.values():
        _emit_pairs(bucket, side_b_refs, pairs, rng, max_bucket_pairs)

    logger.info(
        "text_block(type=%s, mode=%s): %d pairs from %d rows",
        side_a.type_key,
        "cross-side" if side_b is not None else "cross-source",
        len(pairs),
        len(rows),
    )
    return pairs


def embedding_block(
    db: Session,
    side_a: RecordSet,
    side_b: RecordSet | None,
    k: int | None = None,
    representative_ids: set[RecordRef] | None = None,
) -> set[tuple[RecordRef, RecordRef]]:
    if k is None:
        k = settings.matching_blocking_k
    if side_b is not None and side_a.type_key != side_b.type_key:
        raise ValueError(f"type mismatch: {side_a.type_key!r} vs {side_b.type_key!r}")

    combined = list(side_a.refs)
    side_b_refs: set[RecordRef] | None = None
    if side_b is not None:
        combined.extend(side_b.refs)
        side_b_refs = set(side_b.refs)
    rs_combined = RecordSet(type_key=side_a.type_key, refs=combined)
    rows = _load_rows(db, rs_combined)
    rows = _representative_filter(rows, representative_ids)
    rows = [r for r in rows if r.embedding is not None]

    pairs: set[tuple[RecordRef, RecordRef]] = set()

    for r in rows:
        scored = []
        for other in rows:
            if other.ref == r.ref:
                continue
            scored.append((_cosine(r.embedding, other.embedding), other))
        scored.sort(key=lambda x: -x[0])
        for _, other in scored[:k]:
            if side_b_refs is None:
                if r.data_source_id is None or other.data_source_id is None:
                    continue
                if r.data_source_id == other.data_source_id:
                    continue
            else:
                in_b_a = r.ref in side_b_refs
                in_b_b = other.ref in side_b_refs
                if in_b_a == in_b_b:
                    continue
            pairs.add(_ordered(r.ref, other.ref))

    logger.info(
        "embedding_block(type=%s, mode=%s): %d pairs from %d rows",
        side_a.type_key,
        "cross-side" if side_b is not None else "cross-source",
        len(pairs),
        len(rows),
    )
    return pairs


def _cosine(a, b) -> float:
    """Cosine similarity for pgvector/list. Returns 0 on shape mismatch or zero norm."""
    try:
        va = list(a) if not hasattr(a, "tolist") else a.tolist()
        vb = list(b) if not hasattr(b, "tolist") else b.tolist()
    except Exception:
        return 0.0
    if len(va) != len(vb):
        return 0.0
    dot = sum(x * y for x, y in zip(va, vb, strict=False))
    na = sum(x * x for x in va) ** 0.5
    nb = sum(x * x for x in vb) ** 0.5
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def combine_blocks(*block_results: set[tuple[RecordRef, RecordRef]]) -> set[tuple[RecordRef, RecordRef]]:
    result: set[tuple[RecordRef, RecordRef]] = set()
    for block in block_results:
        result |= block
    return result
