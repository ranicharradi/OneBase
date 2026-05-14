"""Matching pipeline — operates on RecordSets, not on "all active sources of a type"."""

import logging
from collections.abc import Callable

from sqlalchemy.orm import Session

from app.config import settings
from app.models.comparison import ComparisonRun
from app.models.enums import CandidateStatus
from app.models.match import MatchCandidate, MatchGroup
from app.models.staging import StagedRecord
from app.models.unified import UnifiedRecord
from app.services.blocking import combine_blocks, embedding_block, text_block
from app.services.clustering import find_groups
from app.services.ml_scoring import blocker_filter, ml_score_pair
from app.services.ml_training import load_active_model
from app.services.record_set import RecordRef, RecordSet
from app.services.scoring import score_pair

logger = logging.getLogger(__name__)


def _resolve(db: Session, refs: set[RecordRef]) -> dict[RecordRef, object]:
    staged_ids = [r.id for r in refs if r.kind == "staged"]
    unified_ids = [r.id for r in refs if r.kind == "unified"]
    out: dict[RecordRef, object] = {}
    if staged_ids:
        for r in db.query(StagedRecord).filter(StagedRecord.id.in_(staged_ids)).all():
            out[RecordRef(r.id, "staged")] = r
    if unified_ids:
        for r in db.query(UnifiedRecord).filter(UnifiedRecord.id.in_(unified_ids)).all():
            out[RecordRef(r.id, "unified")] = r
    return out


def run_matching_pipeline(
    db: Session,
    comparison_run_id: int,
    side_a: RecordSet,
    side_b: RecordSet | None,
    progress_callback: Callable[[str, int], None] | None = None,
) -> dict:
    def _report(stage: str, pct: int) -> None:
        if progress_callback:
            progress_callback(stage, pct)

    run = db.query(ComparisonRun).filter(ComparisonRun.id == comparison_run_id).one()
    type_key = side_a.type_key

    if side_a.is_empty:
        logger.info("run %d: side_a empty — skipping", run.id)
        return {
            "candidate_count": 0,
            "group_count": 0,
            "scope_size_a": 0,
            "scope_size_b": (side_b.size if side_b else None),
        }
    if side_b is not None and side_b.is_empty:
        logger.info("run %d: side_b empty — skipping", run.id)
        return {
            "candidate_count": 0,
            "group_count": 0,
            "scope_size_a": side_a.size,
            "scope_size_b": 0,
        }

    scorer_bundle = load_active_model(db, "scorer", type_key)
    blocker_bundle = load_active_model(db, "blocker", type_key)
    using_ml = scorer_bundle is not None

    _report("BLOCKING", 0)
    text_pairs = text_block(db, side_a, side_b)
    try:
        emb_pairs = embedding_block(db, side_a, side_b)
    except Exception as e:
        logger.warning("embedding_block failed, text-only: %s", e)
        emb_pairs = set()
    all_pairs = combine_blocks(text_pairs, emb_pairs)
    _report("BLOCKING", 100)

    if not all_pairs:
        return {
            "candidate_count": 0,
            "group_count": 0,
            "scope_size_a": side_a.size,
            "scope_size_b": (side_b.size if side_b else None),
        }

    all_refs: set[RecordRef] = set()
    for a, b in all_pairs:
        all_refs.add(a)
        all_refs.add(b)
    record_lookup = _resolve(db, all_refs)

    if blocker_bundle is not None:
        pre = len(all_pairs)
        all_pairs = set(blocker_filter(list(all_pairs), record_lookup, blocker_bundle))
        logger.info("blocker pruned %d → %d", pre, len(all_pairs))
        if not all_pairs:
            return {
                "candidate_count": 0,
                "group_count": 0,
                "scope_size_a": side_a.size,
                "scope_size_b": (side_b.size if side_b else None),
            }

    _report("SCORING", 0)
    scored: list[tuple[RecordRef, RecordRef, float, dict]] = []
    pair_list = list(all_pairs)
    last_pct = -1
    for idx, (ref_a, ref_b) in enumerate(pair_list):
        ra = record_lookup.get(ref_a)
        rb = record_lookup.get(ref_b)
        if ra is None or rb is None:
            logger.info("dropping pair (%s, %s) — ref no longer resolvable", ref_a, ref_b)
            continue
        result = ml_score_pair(ra, rb, scorer_bundle) if using_ml else score_pair(ra, rb)
        conf = result["confidence"]
        signals = result["signals"]
        if conf >= settings.matching_confidence_threshold:
            scored.append((ref_a, ref_b, conf, signals))
        new_pct = int((idx + 1) / len(pair_list) * 100)
        if new_pct != last_pct:
            _report("SCORING", new_pct)
            last_pct = new_pct
    _report("SCORING", 100)

    if not scored:
        return {
            "candidate_count": 0,
            "group_count": 0,
            "scope_size_a": side_a.size,
            "scope_size_b": (side_b.size if side_b else None),
        }

    _report("CLUSTERING", 0)
    above = [(a, b) for a, b, _, _ in scored]
    groups = find_groups(above)
    _report("CLUSTERING", 100)

    _report("INSERTING", 0)
    group_map: dict[RecordRef, MatchGroup] = {}
    for members in groups:
        mg = MatchGroup(type=type_key, comparison_run_id=run.id)
        db.add(mg)
        db.flush()
        for m in members:
            group_map[m] = mg

    candidate_count = 0
    for ref_a, ref_b, conf, signals in scored:
        mg = group_map.get(ref_a) or group_map.get(ref_b)
        cand = MatchCandidate(
            type=type_key,
            comparison_run_id=run.id,
            record_a_id=ref_a.id,
            record_b_id=ref_b.id,
            side_a_kind=ref_a.kind,
            side_b_kind=ref_b.kind,
            confidence=conf,
            match_signals=signals,
            status=CandidateStatus.PENDING,
            group_id=mg.id if mg else None,
        )
        db.add(cand)
        candidate_count += 1
    db.flush()
    _report("INSERTING", 100)

    return {
        "candidate_count": candidate_count,
        "group_count": len(groups),
        "scope_size_a": side_a.size,
        "scope_size_b": (side_b.size if side_b else None),
    }
