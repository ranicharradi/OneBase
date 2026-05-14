"""Matching orchestration service — wires blocking → scoring → clustering into a pipeline.

Type-scoped: every blocking/scoring/clustering call is constrained to records of
a single RecordType. The type is derived from the batch's DataSource.type.
"""

import logging
from collections.abc import Callable

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.config import settings
from app.models.batch import ImportBatch
from app.models.comparison import ComparisonRun
from app.models.enums import CandidateStatus, RecordStatus
from app.models.match import MatchCandidate, MatchGroup
from app.models.source import DataSource
from app.models.staging import StagedRecord
from app.services.blocking import combine_blocks, embedding_block, text_block
from app.services.clustering import find_groups
from app.services.grouping import group_intra_source
from app.services.ml_scoring import blocker_filter, ml_score_pair
from app.services.ml_training import load_active_model
from app.services.scoring import score_pair

logger = logging.getLogger(__name__)


def _invalidate_old_candidates(db: Session, source_id: int) -> int:
    """Invalidate match candidates referencing records from the given source."""
    record_ids = [rid for (rid,) in db.query(StagedRecord.id).filter(StagedRecord.data_source_id == source_id).all()]
    if not record_ids:
        return 0

    candidates = (
        db.query(MatchCandidate)
        .filter(
            MatchCandidate.status != CandidateStatus.INVALIDATED,
            (MatchCandidate.record_a_id.in_(record_ids) | MatchCandidate.record_b_id.in_(record_ids)),
        )
        .all()
    )
    count = 0
    for c in candidates:
        c.status = CandidateStatus.INVALIDATED
        c.group_id = None
        count += 1
    if count:
        logger.info("Invalidated %d old candidates for source %d", count, source_id)
    return count


def _get_active_source_ids(db: Session, type_key: str, batch_id: int) -> list[int]:
    """Get all source IDs with active records of the given type, including the batch's source."""
    batch = db.query(ImportBatch).filter(ImportBatch.id == batch_id).one()
    batch_source_id = batch.data_source_id

    source_ids = [
        sid
        for (sid,) in db.query(StagedRecord.data_source_id)
        .filter(
            StagedRecord.type == type_key,
            StagedRecord.status == RecordStatus.ACTIVE,
        )
        .distinct()
        .all()
    ]
    if batch_source_id not in source_ids:
        source_ids.append(batch_source_id)
    return source_ids


def run_matching_pipeline(
    db: Session,
    batch_id: int,
    progress_callback: Callable[[str, int], None] | None = None,
    invalidate_source_id: int | None = None,
    comparison_run_id: int | None = None,
) -> dict:
    """Run the full matching pipeline for the type bound to the batch's data source."""

    def _report(stage: str, pct: int) -> None:
        if progress_callback:
            progress_callback(stage, pct)

    batch = db.query(ImportBatch).filter(ImportBatch.id == batch_id).one()
    source = db.query(DataSource).filter(DataSource.id == batch.data_source_id).one()
    type_key = source.type

    # Ensure we have a ComparisonRun to scope match groups and candidates
    if comparison_run_id is None:
        run = ComparisonRun(
            type=type_key,
            mode="FILE_VS_FILE",
            status="running",
            created_by="system",
        )
        db.add(run)
        db.flush()
        comparison_run_id = run.id

    if invalidate_source_id is not None:
        _invalidate_old_candidates(db, invalidate_source_id)

    source_ids = _get_active_source_ids(db, type_key, batch_id)

    _report("GROUPING", 0)
    grouping_stats = group_intra_source(db, type_key, source_ids)
    _report("GROUPING", 100)
    logger.info("Intra-source grouping(type=%s): %s", type_key, grouping_stats)

    if len(source_ids) < 2:
        logger.info("Fewer than 2 sources of type %s — skipping matching for batch %d", type_key, batch_id)
        return {"candidate_count": 0, "group_count": 0}

    scorer_bundle = load_active_model(db, "scorer", type_key)
    blocker_bundle = load_active_model(db, "blocker", type_key)
    using_ml = scorer_bundle is not None
    if using_ml:
        logger.info("Using ML scorer model for this pipeline run")
    else:
        logger.info("No ML model — using weighted-sum scorer from RecordType config")

    reps = db.query(StagedRecord.id).filter(
        StagedRecord.type == type_key,
        StagedRecord.data_source_id.in_(source_ids),
        StagedRecord.status == RecordStatus.ACTIVE,
        or_(
            StagedRecord.intra_source_group_id == StagedRecord.id,
            StagedRecord.intra_source_group_id.is_(None),
        ),
    )
    representative_ids = {r.id for r in reps}
    logger.info("Representatives: %d active records of type %s", len(representative_ids), type_key)

    _report("BLOCKING", 0)
    text_pairs = text_block(db, type_key, source_ids, representative_ids=representative_ids)
    try:
        emb_pairs = embedding_block(db, type_key, source_ids, representative_ids=representative_ids)
    except Exception as e:
        logger.warning("embedding_block failed, falling back to text-only blocking: %s", e)
        db.rollback()
        emb_pairs = set()
    all_pairs = combine_blocks(text_pairs, emb_pairs)
    _report("BLOCKING", 100)

    logger.info("Blocking produced %d candidate pairs", len(all_pairs))
    if not all_pairs:
        return {"candidate_count": 0, "group_count": 0}

    if blocker_bundle is not None:
        blocker_record_ids = set()
        for a_id, b_id in all_pairs:
            blocker_record_ids.add(a_id)
            blocker_record_ids.add(b_id)
        blocker_records = db.query(StagedRecord).filter(StagedRecord.id.in_(blocker_record_ids)).all()
        blocker_lookup = {r.id: r for r in blocker_records}
        pre_filter_count = len(all_pairs)
        all_pairs = set(blocker_filter(list(all_pairs), blocker_lookup, blocker_bundle))
        logger.info("Blocker pruned %d → %d pairs", pre_filter_count, len(all_pairs))
        if not all_pairs:
            return {"candidate_count": 0, "group_count": 0}

    _report("SCORING", 0)
    scored_pairs: list[tuple[int, int, float, dict]] = []
    pair_list = list(all_pairs)
    record_cache: dict[int, StagedRecord] = {}

    for idx, (a_id, b_id) in enumerate(pair_list):
        if a_id not in record_cache:
            record_cache[a_id] = db.query(StagedRecord).filter(StagedRecord.id == a_id).first()
        if b_id not in record_cache:
            record_cache[b_id] = db.query(StagedRecord).filter(StagedRecord.id == b_id).first()
        record_a = record_cache[a_id]
        record_b = record_cache[b_id]
        if record_a is None or record_b is None:
            logger.warning("Record not found for pair (%d, %d) — skipping", a_id, b_id)
            continue

        result = ml_score_pair(record_a, record_b, scorer_bundle) if using_ml else score_pair(record_a, record_b)
        confidence = result["confidence"]
        signals = result["signals"]

        if confidence >= settings.matching_confidence_threshold:
            scored_pairs.append((a_id, b_id, confidence, signals))

        if pair_list:
            _report("SCORING", int((idx + 1) / len(pair_list) * 100))

    _report("SCORING", 100)
    logger.info(
        "Scoring: %d/%d pairs above threshold (%.2f)",
        len(scored_pairs),
        len(pair_list),
        settings.matching_confidence_threshold,
    )
    if not scored_pairs:
        return {"candidate_count": 0, "group_count": 0}

    _report("CLUSTERING", 0)
    above_threshold_pairs = [(a_id, b_id) for a_id, b_id, _, _ in scored_pairs]
    groups = find_groups(above_threshold_pairs)
    _report("CLUSTERING", 100)
    logger.info("Clustering: %d groups from %d pairs", len(groups), len(scored_pairs))

    _report("INSERTING", 0)
    group_map: dict[int, MatchGroup] = {}
    for group_members in groups:
        mg = MatchGroup(type=type_key, comparison_run_id=comparison_run_id)
        db.add(mg)
        db.flush()
        for member_id in group_members:
            group_map[member_id] = mg

    existing_pairs: set[tuple[int, int]] = set()
    existing = (
        db.query(MatchCandidate.record_a_id, MatchCandidate.record_b_id)
        .filter(MatchCandidate.status != CandidateStatus.INVALIDATED)
        .all()
    )
    for ea, eb in existing:
        existing_pairs.add((min(ea, eb), max(ea, eb)))

    candidate_count = 0
    for a_id, b_id, confidence, signals in scored_pairs:
        pair_key = (min(a_id, b_id), max(a_id, b_id))
        if pair_key in existing_pairs:
            continue
        group = group_map.get(a_id) or group_map.get(b_id)
        candidate = MatchCandidate(
            type=type_key,
            comparison_run_id=comparison_run_id,
            record_a_id=pair_key[0],
            record_b_id=pair_key[1],
            confidence=confidence,
            match_signals=signals,
            status=CandidateStatus.PENDING,
            group_id=group.id if group else None,
        )
        db.add(candidate)
        existing_pairs.add(pair_key)
        candidate_count += 1

    db.flush()
    _report("INSERTING", 100)

    group_count = len(groups)
    logger.info(
        "Pipeline complete for batch %d (type=%s): %d candidates, %d groups",
        batch_id,
        type_key,
        candidate_count,
        group_count,
    )

    return {"candidate_count": candidate_count, "group_count": group_count}
