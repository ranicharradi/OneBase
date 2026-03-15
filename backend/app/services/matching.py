"""Matching orchestration service — wires blocking → scoring → clustering into a pipeline.

Coordinates the full matching flow:
1. (Optional) Invalidate old candidates on re-upload
2. BLOCKING: Generate candidate pairs via text + embedding blocking
3. SCORING: Score each candidate pair with multi-signal scoring
4. CLUSTERING: Group above-threshold pairs into transitive clusters
5. INSERTING: Create MatchGroup and MatchCandidate records
"""

import logging
from collections.abc import Callable

from sqlalchemy.orm import Session

from app.config import settings
from app.models.batch import ImportBatch
from app.models.match import MatchCandidate, MatchGroup
from app.models.staging import StagedSupplier
from app.services.blocking import text_block, embedding_block, combine_blocks
from app.services.scoring import score_pair
from app.services.clustering import find_groups

logger = logging.getLogger(__name__)


def _invalidate_old_candidates(db: Session, source_id: int) -> int:
    """Invalidate all match candidates involving suppliers from the given source.

    Clears group_id and sets status to 'invalidated' for candidates where
    supplier_a or supplier_b belongs to the re-uploaded source.

    Returns:
        Count of invalidated candidates.
    """
    # Get supplier IDs belonging to this source
    supplier_ids = [
        sid
        for (sid,) in db.query(StagedSupplier.id)
        .filter(StagedSupplier.data_source_id == source_id)
        .all()
    ]

    if not supplier_ids:
        return 0

    # Find candidates involving these suppliers that are not already invalidated
    candidates = (
        db.query(MatchCandidate)
        .filter(
            MatchCandidate.status != "invalidated",
            (
                MatchCandidate.supplier_a_id.in_(supplier_ids)
                | MatchCandidate.supplier_b_id.in_(supplier_ids)
            ),
        )
        .all()
    )

    count = 0
    for c in candidates:
        c.status = "invalidated"
        c.group_id = None
        count += 1

    if count:
        logger.info("Invalidated %d old candidates for source %d", count, source_id)

    return count


def _get_active_source_ids(db: Session, batch_id: int) -> list[int]:
    """Get all source IDs that have active suppliers, including the batch's source."""
    batch = db.query(ImportBatch).filter(ImportBatch.id == batch_id).one()
    batch_source_id = batch.data_source_id

    # Get all source IDs with active suppliers
    source_ids = [
        sid
        for (sid,) in db.query(StagedSupplier.data_source_id)
        .filter(StagedSupplier.status == "active")
        .distinct()
        .all()
    ]

    # Ensure batch's source is included
    if batch_source_id not in source_ids:
        source_ids.append(batch_source_id)

    return source_ids


def run_matching_pipeline(
    db: Session,
    batch_id: int,
    progress_callback: Callable[[str, int], None] | None = None,
    invalidate_source_id: int | None = None,
) -> dict:
    """Run the full matching pipeline: blocking → scoring → clustering → insert.

    Args:
        db: Database session (caller manages commit/rollback).
        batch_id: The import batch that triggered matching.
        progress_callback: Optional callback(stage: str, pct: int) for progress.
        invalidate_source_id: If set, invalidate old candidates for this source
            before running (re-upload scenario).

    Returns:
        Dict with candidate_count and group_count.
    """

    def _report(stage: str, pct: int) -> None:
        if progress_callback:
            progress_callback(stage, pct)

    # Step 0: Invalidate old candidates if re-upload
    if invalidate_source_id is not None:
        _invalidate_old_candidates(db, invalidate_source_id)

    # Get all active source IDs
    source_ids = _get_active_source_ids(db, batch_id)

    if len(source_ids) < 2:
        logger.info("Fewer than 2 sources — skipping matching for batch %d", batch_id)
        return {"candidate_count": 0, "group_count": 0}

    # Step 1: BLOCKING
    _report("BLOCKING", 0)
    text_pairs = text_block(db, source_ids)
    emb_pairs = embedding_block(db, source_ids)
    all_pairs = combine_blocks(text_pairs, emb_pairs)
    _report("BLOCKING", 100)

    logger.info("Blocking produced %d candidate pairs", len(all_pairs))

    if not all_pairs:
        return {"candidate_count": 0, "group_count": 0}

    # Step 2: SCORING
    _report("SCORING", 0)
    scored_pairs: list[tuple[int, int, float, dict]] = []
    pair_list = list(all_pairs)

    # Cache loaded suppliers for efficiency
    supplier_cache: dict[int, StagedSupplier] = {}

    for idx, (a_id, b_id) in enumerate(pair_list):
        # Load suppliers (with caching)
        if a_id not in supplier_cache:
            supplier_cache[a_id] = (
                db.query(StagedSupplier).filter(StagedSupplier.id == a_id).first()
            )
        if b_id not in supplier_cache:
            supplier_cache[b_id] = (
                db.query(StagedSupplier).filter(StagedSupplier.id == b_id).first()
            )

        supplier_a = supplier_cache[a_id]
        supplier_b = supplier_cache[b_id]

        if supplier_a is None or supplier_b is None:
            logger.warning(
                "Supplier not found for pair (%d, %d) — skipping", a_id, b_id
            )
            continue

        result = score_pair(supplier_a, supplier_b)
        confidence = result["confidence"]
        signals = result["signals"]

        if confidence >= settings.matching_confidence_threshold:
            scored_pairs.append((a_id, b_id, confidence, signals))

        if len(pair_list) > 0:
            pct = int((idx + 1) / len(pair_list) * 100)
            _report("SCORING", pct)

    _report("SCORING", 100)

    logger.info(
        "Scoring: %d/%d pairs above threshold (%.2f)",
        len(scored_pairs),
        len(pair_list),
        settings.matching_confidence_threshold,
    )

    if not scored_pairs:
        return {"candidate_count": 0, "group_count": 0}

    # Step 3: CLUSTERING
    _report("CLUSTERING", 0)
    above_threshold_pairs = [(a_id, b_id) for a_id, b_id, _, _ in scored_pairs]
    groups = find_groups(above_threshold_pairs)
    _report("CLUSTERING", 100)

    logger.info("Clustering: %d groups from %d pairs", len(groups), len(scored_pairs))

    # Step 4: INSERTING
    _report("INSERTING", 0)

    # Create MatchGroup records
    group_map: dict[int, MatchGroup] = {}  # supplier_id -> MatchGroup
    for group_members in groups:
        mg = MatchGroup()
        db.add(mg)
        db.flush()  # Get mg.id
        for member_id in group_members:
            group_map[member_id] = mg

    # Build a set of existing non-invalidated pairs for dedup
    existing_pairs: set[tuple[int, int]] = set()
    existing = (
        db.query(MatchCandidate.supplier_a_id, MatchCandidate.supplier_b_id)
        .filter(MatchCandidate.status != "invalidated")
        .all()
    )
    for ea, eb in existing:
        existing_pairs.add((min(ea, eb), max(ea, eb)))

    # Create MatchCandidate records
    candidate_count = 0
    for a_id, b_id, confidence, signals in scored_pairs:
        pair_key = (min(a_id, b_id), max(a_id, b_id))
        if pair_key in existing_pairs:
            continue  # Skip duplicates

        # Find group for this pair
        group = group_map.get(a_id) or group_map.get(b_id)

        candidate = MatchCandidate(
            supplier_a_id=pair_key[0],
            supplier_b_id=pair_key[1],
            confidence=confidence,
            match_signals=signals,
            status="pending",
            group_id=group.id if group else None,
        )
        db.add(candidate)
        existing_pairs.add(pair_key)  # Track to avoid dupes within batch
        candidate_count += 1

    db.flush()
    _report("INSERTING", 100)

    group_count = len(groups)
    logger.info(
        "Pipeline complete for batch %d: %d candidates, %d groups",
        batch_id,
        candidate_count,
        group_count,
    )

    return {"candidate_count": candidate_count, "group_count": group_count}
