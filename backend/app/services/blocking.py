"""Blocking service — candidate pair generation for matching, scoped per type."""

import logging
import math
import random
from collections import defaultdict

from sqlalchemy.orm import Session

from app.config import settings
from app.models.enums import RecordStatus
from app.models.staging import StagedRecord

logger = logging.getLogger(__name__)


def text_block(
    db: Session,
    type_key: str,
    source_ids: list[int],
    representative_ids: set[int] | None = None,
) -> set[tuple[int, int]]:
    """Generate candidate pairs via normalized_name prefix and first-token overlap,
    scoped to a single record type.
    """
    query = db.query(StagedRecord).filter(
        StagedRecord.type == type_key,
        StagedRecord.data_source_id.in_(source_ids),
        StagedRecord.status == RecordStatus.ACTIVE,
    )
    if representative_ids is not None:
        query = query.filter(StagedRecord.id.in_(representative_ids))
    records = query.all()

    prefix_buckets: dict[str, list[StagedRecord]] = defaultdict(list)
    token_buckets: dict[str, list[StagedRecord]] = defaultdict(list)

    for r in records:
        if not r.normalized_name:
            continue
        name = r.normalized_name.strip()
        if not name:
            continue
        if len(name) >= 3:
            prefix_buckets[name[:3]].append(r)
        first_token = name.split()[0] if name.split() else None
        if first_token:
            token_buckets[first_token].append(r)

    max_bucket_pairs = settings.matching_max_bucket_pairs
    pairs: set[tuple[int, int]] = set()
    rng = random.Random(42)  # noqa: S311 — deterministic subsampling

    def _add_cross_pairs(bucket: list[StagedRecord]) -> None:
        by_source: dict[int, list[StagedRecord]] = defaultdict(list)
        for r in bucket:
            by_source[r.data_source_id].append(r)
        source_lists = list(by_source.values())
        for i in range(len(source_lists)):
            for j in range(i + 1, len(source_lists)):
                side_a = source_lists[i]
                side_b = source_lists[j]
                if len(side_a) * len(side_b) > max_bucket_pairs:
                    k = max(1, math.isqrt(max_bucket_pairs))
                    side_a = rng.sample(side_a, min(k, len(side_a)))
                    side_b = rng.sample(side_b, min(k, len(side_b)))
                for a in side_a:
                    for b in side_b:
                        pairs.add((min(a.id, b.id), max(a.id, b.id)))

    for bucket in prefix_buckets.values():
        _add_cross_pairs(bucket)
    for bucket in token_buckets.values():
        _add_cross_pairs(bucket)

    logger.info(
        "text_block(type=%s): %d pairs from %d records across %d sources",
        type_key,
        len(pairs),
        len(records),
        len(source_ids),
    )
    return pairs


def _get_embedding_neighbors(
    db: Session,
    record: StagedRecord,
    type_key: str,
    source_ids: list[int],
    k: int,
    representative_ids: set[int] | None = None,
) -> list[int]:
    """Query pgvector for K nearest neighbors from different sources within the same type."""
    query = db.query(StagedRecord.id).filter(
        StagedRecord.type == type_key,
        StagedRecord.data_source_id != record.data_source_id,
        StagedRecord.data_source_id.in_(source_ids),
        StagedRecord.status == RecordStatus.ACTIVE,
        StagedRecord.name_embedding.isnot(None),
    )
    if representative_ids is not None:
        query = query.filter(StagedRecord.id.in_(representative_ids))
    neighbors = query.order_by(StagedRecord.name_embedding.cosine_distance(record.name_embedding)).limit(k).all()
    return [n.id for n in neighbors]


def _get_records_with_embeddings(
    db: Session,
    type_key: str,
    source_ids: list[int],
    representative_ids: set[int] | None = None,
) -> list[StagedRecord]:
    """Query active records of a given type that have embeddings."""
    query = db.query(StagedRecord).filter(
        StagedRecord.type == type_key,
        StagedRecord.data_source_id.in_(source_ids),
        StagedRecord.status == RecordStatus.ACTIVE,
        StagedRecord.name_embedding.isnot(None),
    )
    if representative_ids is not None:
        query = query.filter(StagedRecord.id.in_(representative_ids))
    return query.all()


def embedding_block(
    db: Session,
    type_key: str,
    source_ids: list[int],
    k: int | None = None,
    representative_ids: set[int] | None = None,
) -> set[tuple[int, int]]:
    """Generate candidate pairs via pgvector ANN cosine search, scoped to a type."""
    if k is None:
        k = settings.matching_blocking_k

    records = _get_records_with_embeddings(db, type_key, source_ids, representative_ids)
    pairs: set[tuple[int, int]] = set()

    for record in records:
        neighbor_ids = _get_embedding_neighbors(db, record, type_key, source_ids, k, representative_ids)
        for nid in neighbor_ids:
            pairs.add((min(record.id, nid), max(record.id, nid)))

    logger.info(
        "embedding_block(type=%s): %d pairs from %d records with embeddings",
        type_key,
        len(pairs),
        len(records),
    )
    return pairs


def combine_blocks(*block_results: set[tuple[int, int]]) -> set[tuple[int, int]]:
    """Union of all blocking results."""
    result: set[tuple[int, int]] = set()
    for block in block_results:
        result |= block
    return result
