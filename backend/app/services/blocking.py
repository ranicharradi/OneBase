"""Blocking service — candidate pair generation for matching.

Two blocking strategies:
1. Text-based: prefix (3-char) and first-token overlap on normalized_name
2. Embedding-based: pgvector ANN cosine distance (K nearest neighbors)

Both produce cross-entity pairs only (never within same data source).
"""

import logging
from collections import defaultdict

from sqlalchemy.orm import Session

from app.config import settings
from app.models.staging import StagedSupplier

logger = logging.getLogger(__name__)


def text_block(
    db: Session, source_ids: list[int], representative_ids: set[int] | None = None
) -> set[tuple[int, int]]:
    """Generate candidate pairs via normalized_name prefix and first-token overlap.

    Args:
        db: Database session.
        source_ids: List of data source IDs to include.
        representative_ids: Optional set of supplier IDs to restrict blocking to.

    Returns:
        Set of (min_id, max_id) supplier pairs, cross-entity only.
    """
    # Query all active suppliers for given sources
    query = (
        db.query(StagedSupplier)
        .filter(
            StagedSupplier.data_source_id.in_(source_ids),
            StagedSupplier.status == "active",
        )
    )
    if representative_ids is not None:
        query = query.filter(StagedSupplier.id.in_(representative_ids))
    suppliers = query.all()

    # Build prefix dict (3-char prefix) and first-token dict
    prefix_buckets: dict[str, list[StagedSupplier]] = defaultdict(list)
    token_buckets: dict[str, list[StagedSupplier]] = defaultdict(list)

    for s in suppliers:
        if not s.normalized_name:
            continue

        name = s.normalized_name.strip()
        if not name:
            continue

        # 3-char prefix bucket (only if name length >= 3)
        if len(name) >= 3:
            prefix = name[:3]
            prefix_buckets[prefix].append(s)

        # First token bucket
        first_token = name.split()[0] if name.split() else None
        if first_token:
            token_buckets[first_token].append(s)

    # Generate cross-entity pairs from buckets
    pairs: set[tuple[int, int]] = set()

    def _add_cross_pairs(bucket: list[StagedSupplier]) -> None:
        for i in range(len(bucket)):
            for j in range(i + 1, len(bucket)):
                a, b = bucket[i], bucket[j]
                if a.data_source_id != b.data_source_id:
                    pair = (min(a.id, b.id), max(a.id, b.id))
                    pairs.add(pair)

    for bucket in prefix_buckets.values():
        _add_cross_pairs(bucket)

    for bucket in token_buckets.values():
        _add_cross_pairs(bucket)

    logger.info(
        "text_block: %d pairs from %d suppliers across %d sources",
        len(pairs),
        len(suppliers),
        len(source_ids),
    )
    return pairs


def _get_embedding_neighbors(
    db: Session, supplier: StagedSupplier, source_ids: list[int], k: int,
    representative_ids: set[int] | None = None,
) -> list[int]:
    """Query pgvector for K nearest neighbors from different sources.

    This is separated so it can be mocked in SQLite tests.

    Args:
        db: Database session.
        supplier: The supplier to find neighbors for.
        source_ids: List of data source IDs to include.
        k: Number of nearest neighbors.
        representative_ids: Optional set of supplier IDs to restrict query to.

    Returns:
        List of neighbor supplier IDs.
    """
    # pgvector cosine distance query
    query = (
        db.query(StagedSupplier.id)
        .filter(
            StagedSupplier.data_source_id != supplier.data_source_id,
            StagedSupplier.data_source_id.in_(source_ids),
            StagedSupplier.status == "active",
            StagedSupplier.name_embedding.isnot(None),
        )
    )
    if representative_ids is not None:
        query = query.filter(StagedSupplier.id.in_(representative_ids))
    neighbors = query.order_by(
        StagedSupplier.name_embedding.cosine_distance(supplier.name_embedding)
    ).limit(k).all()
    return [n.id for n in neighbors]


def _get_suppliers_with_embeddings(
    db: Session, source_ids: list[int], representative_ids: set[int] | None = None
) -> list[StagedSupplier]:
    """Query active suppliers that have embeddings.

    Separated so it can be mocked in SQLite tests (pgvector not available).

    Args:
        db: Database session.
        source_ids: List of data source IDs to include.
        representative_ids: Optional set of supplier IDs to restrict query to.

    Returns:
        List of StagedSupplier with non-null embeddings.
    """
    query = (
        db.query(StagedSupplier)
        .filter(
            StagedSupplier.data_source_id.in_(source_ids),
            StagedSupplier.status == "active",
            StagedSupplier.name_embedding.isnot(None),
        )
    )
    if representative_ids is not None:
        query = query.filter(StagedSupplier.id.in_(representative_ids))
    return query.all()


def embedding_block(
    db: Session, source_ids: list[int], k: int | None = None,
    representative_ids: set[int] | None = None,
) -> set[tuple[int, int]]:
    """Generate candidate pairs via pgvector ANN cosine distance search.

    Args:
        db: Database session.
        source_ids: List of data source IDs to include.
        k: Number of nearest neighbors (defaults to settings.matching_blocking_k).
        representative_ids: Optional set of supplier IDs to restrict blocking to.

    Returns:
        Set of (min_id, max_id) supplier pairs, cross-entity only.
    """
    if k is None:
        k = settings.matching_blocking_k

    suppliers = _get_suppliers_with_embeddings(db, source_ids, representative_ids)

    pairs: set[tuple[int, int]] = set()

    for supplier in suppliers:
        neighbor_ids = _get_embedding_neighbors(db, supplier, source_ids, k, representative_ids)
        for nid in neighbor_ids:
            pair = (min(supplier.id, nid), max(supplier.id, nid))
            pairs.add(pair)

    logger.info(
        "embedding_block: %d pairs from %d suppliers with embeddings",
        len(pairs),
        len(suppliers),
    )
    return pairs


def combine_blocks(*block_results: set[tuple[int, int]]) -> set[tuple[int, int]]:
    """Union of all blocking results.

    Args:
        *block_results: Variable number of pair sets from different blocking strategies.

    Returns:
        Deduplicated union of all pairs.
    """
    result: set[tuple[int, int]] = set()
    for block in block_results:
        result |= block
    return result
