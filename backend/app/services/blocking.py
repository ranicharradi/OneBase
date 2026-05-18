"""Blocking — candidate pair generation scoped to a single record type."""

import logging
import math
import random
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass

from sklearn.metrics.pairwise import cosine_similarity
from sqlalchemy.orm import Session

from app.config import settings
from app.models.staging import StagedRecord
from app.models.unified import UnifiedRecord
from app.services.normalization import is_placeholder_name
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
        if is_placeholder_name(r.normalized_name):
            continue
        name = r.normalized_name.strip()
        if len(name) >= 3:
            prefix_buckets[name[:3]].append(r)
        toks = name.split()
        if toks:
            token_buckets[toks[0]].append(r)
    return prefix_buckets, token_buckets


def _emit_pairs(
    bucket_rows: Iterable[_BlockingRow],
    side_b_refs: set[RecordRef],
    pairs: set[tuple[RecordRef, RecordRef]],
    rng: random.Random,
    max_bucket_pairs: int,
) -> None:
    """For a single bucket, add all valid pairs (one ref from each side)."""
    bucket_list = list(bucket_rows)
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
    side_b: RecordSet,
    representative_ids: set[RecordRef] | None = None,
) -> set[tuple[RecordRef, RecordRef]]:
    if side_a.type_key != side_b.type_key:
        raise ValueError(f"type mismatch: {side_a.type_key!r} vs {side_b.type_key!r}")

    combined = list(side_a.refs) + list(side_b.refs)
    side_b_refs: set[RecordRef] = set(side_b.refs)

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
        "text_block(type=%s, mode=cross-side): %d pairs from %d rows",
        side_a.type_key,
        len(pairs),
        len(rows),
    )
    return pairs


def embedding_block(
    db: Session,
    side_a: RecordSet,
    side_b: RecordSet,
    k: int | None = None,
    representative_ids: set[RecordRef] | None = None,
) -> set[tuple[RecordRef, RecordRef]]:
    if k is None:
        k = settings.matching_blocking_k
    if side_a.type_key != side_b.type_key:
        raise ValueError(f"type mismatch: {side_a.type_key!r} vs {side_b.type_key!r}")

    combined = list(side_a.refs) + list(side_b.refs)
    side_b_refs: set[RecordRef] = set(side_b.refs)
    rs_combined = RecordSet(type_key=side_a.type_key, refs=combined)
    rows = _load_rows(db, rs_combined)
    rows = _representative_filter(rows, representative_ids)
    rows = [r for r in rows if r.embedding is not None and not is_placeholder_name(r.normalized_name)]

    pairs: set[tuple[RecordRef, RecordRef]] = set()

    side_a_rows = [r for r in rows if r.ref not in side_b_refs]
    side_b_rows = [r for r in rows if r.ref in side_b_refs]
    _emit_embedding_pairs(side_a_rows, side_b_rows, pairs, k)

    logger.info(
        "embedding_block(type=%s, mode=cross-side): %d pairs from %d rows",
        side_a.type_key,
        len(pairs),
        len(rows),
    )
    return pairs


def _emit_embedding_pairs(
    left_rows: list[_BlockingRow],
    right_rows: list[_BlockingRow],
    pairs: set[tuple[RecordRef, RecordRef]],
    k: int,
) -> None:
    """Add each row's top-k cosine neighbors from the valid opposite row set."""
    if k <= 0 or not left_rows or not right_rows:
        return

    left_rows, left_vectors = _embedding_matrix(left_rows)
    right_rows, right_vectors = _embedding_matrix(right_rows)
    if not left_rows or not right_rows:
        return

    common_dim = len(left_vectors[0])
    if len(right_vectors[0]) != common_dim:
        logger.warning(
            "embedding_block skipped incompatible dimensions: left=%d right=%d",
            common_dim,
            len(right_vectors[0]),
        )
        return

    similarities = cosine_similarity(left_vectors, right_vectors)
    left_take = min(k, len(right_rows))
    right_take = min(k, len(left_rows))

    for left_idx, scores in enumerate(similarities):
        for right_idx in scores.argsort()[-left_take:][::-1]:
            pairs.add(_ordered(left_rows[left_idx].ref, right_rows[right_idx].ref))

    for right_idx, scores in enumerate(similarities.T):
        for left_idx in scores.argsort()[-right_take:][::-1]:
            pairs.add(_ordered(left_rows[left_idx].ref, right_rows[right_idx].ref))


def _embedding_matrix(rows: list[_BlockingRow]) -> tuple[list[_BlockingRow], list[list[float]]]:
    valid_rows: list[_BlockingRow] = []
    vectors: list[list[float]] = []
    expected_dim: int | None = None
    for row in rows:
        vector = _embedding_values(row.embedding)
        if vector is None:
            continue
        if expected_dim is None:
            expected_dim = len(vector)
        if len(vector) != expected_dim:
            logger.warning(
                "embedding_block skipped row %s with dimension %d; expected %d",
                row.ref,
                len(vector),
                expected_dim,
            )
            continue
        valid_rows.append(row)
        vectors.append(vector)
    return valid_rows, vectors


def _embedding_values(embedding: object) -> list[float] | None:
    try:
        values = embedding.tolist() if hasattr(embedding, "tolist") else list(embedding)
    except Exception:
        return None
    if not values:
        return None
    try:
        return [float(v) for v in values]
    except (TypeError, ValueError):
        return None


def combine_blocks(*block_results: set[tuple[RecordRef, RecordRef]]) -> set[tuple[RecordRef, RecordRef]]:
    result: set[tuple[RecordRef, RecordRef]] = set()
    for block in block_results:
        result |= block
    return result
