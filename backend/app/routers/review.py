"""Review & merge API router — review queue, match detail, and merge/reject actions."""

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.dependencies import Pagination, get_current_user, get_db, get_or_404, get_pagination, require_role
from app.models.enums import CandidateStatus, UserRole
from app.models.match import MatchCandidate
from app.models.source import DataSource
from app.models.staging import StagedRecord
from app.models.unified import UnifiedRecord
from app.models.user import User
from app.schemas.review import (
    FieldComparison,
    MatchDetailResponse,
    MergeRequest,
    RecordDetail,
    ReviewActionResponse,
    ReviewQueueItem,
    ReviewQueueResponse,
    ReviewStatsResponse,
)
from app.services.merge import (
    compare_fields,
    execute_merge,
    reject_candidate,
)
from app.services.record_lookup import load_enriched_records

router = APIRouter(prefix="/api/review", tags=["review"])


def _load_record_detail(db: Session, record_id: int) -> tuple[StagedRecord, DataSource]:
    """Load a staged record and its data source."""
    record = get_or_404(db, StagedRecord, record_id, label=f"Staged record {record_id}")
    source = db.get(DataSource, record.data_source_id)
    return record, source


# ── Review queue ──


@router.get("/queue", response_model=ReviewQueueResponse)
def get_review_queue(
    status_filter: str = Query("pending", alias="status"),
    type: str | None = Query(None, description="Filter by record type"),
    comparison_run_id: int | None = Query(None, description="Scope to a specific comparison run"),
    source_a_id: int | None = Query(None, description="Filter by record A source"),
    source_b_id: int | None = Query(None, description="Filter by record B source"),
    min_confidence: float | None = Query(None, ge=0.0, le=1.0),
    max_confidence: float | None = Query(None, ge=0.0, le=1.0),
    pagination: Pagination = Depends(get_pagination),
    sort: Literal["confidence_desc", "confidence_asc", "active_learning"] = Query(
        "confidence_desc", description="Sort order for the queue"
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get paginated review queue with filtering."""
    query = db.query(MatchCandidate)

    if type is not None:
        query = query.filter(MatchCandidate.type == type)
    if comparison_run_id is not None:
        query = query.filter(MatchCandidate.comparison_run_id == comparison_run_id)
    if status_filter:
        query = query.filter(MatchCandidate.status == status_filter)
    if min_confidence is not None:
        query = query.filter(MatchCandidate.confidence >= min_confidence)
    if max_confidence is not None:
        query = query.filter(MatchCandidate.confidence <= max_confidence)

    if source_a_id is not None or source_b_id is not None:
        RecA = db.query(StagedRecord.id, StagedRecord.data_source_id).subquery("rec_a")
        RecB = db.query(StagedRecord.id, StagedRecord.data_source_id).subquery("rec_b")
        query = query.join(RecA, MatchCandidate.record_a_id == RecA.c.id)
        query = query.join(RecB, MatchCandidate.record_b_id == RecB.c.id)
        if source_a_id is not None and source_b_id is not None:
            query = query.filter(
                ((RecA.c.data_source_id == source_a_id) & (RecB.c.data_source_id == source_b_id))
                | ((RecA.c.data_source_id == source_b_id) & (RecB.c.data_source_id == source_a_id))
            )
        elif source_a_id is not None:
            query = query.filter((RecA.c.data_source_id == source_a_id) | (RecB.c.data_source_id == source_a_id))
        elif source_b_id is not None:
            query = query.filter((RecA.c.data_source_id == source_b_id) | (RecB.c.data_source_id == source_b_id))

    total = query.count()

    if sort == "confidence_asc":
        query = query.order_by(MatchCandidate.confidence.asc())
    elif sort == "active_learning":
        query = query.order_by(func.abs(MatchCandidate.confidence - 0.5).asc())
    else:
        query = query.order_by(MatchCandidate.confidence.desc())

    candidates = query.offset(pagination.offset).limit(pagination.limit).all()

    record_ids: set[int] = set()
    for c in candidates:
        record_ids.add(c.record_a_id)
        record_ids.add(c.record_b_id)

    record_info = load_enriched_records(db, list(record_ids))

    items = []
    for c in candidates:
        a = record_info.get(c.record_a_id, {"name": None, "source_name": None, "fields": {}})
        b = record_info.get(c.record_b_id, {"name": None, "source_name": None, "fields": {}})
        items.append(
            ReviewQueueItem(
                id=c.id,
                type=c.type,
                record_a_id=c.record_a_id,
                record_b_id=c.record_b_id,
                record_a_name=a["name"],
                record_b_name=b["name"],
                record_a_source=a["source_name"],
                record_b_source=b["source_name"],
                record_a_fields=a["fields"],
                record_b_fields=b["fields"],
                confidence=c.confidence,
                match_signals=c.match_signals or {},
                status=c.status,
                group_id=c.group_id,
                created_at=c.created_at,
                reviewed_by=c.reviewed_by,
                reviewed_at=c.reviewed_at,
            )
        )

    return ReviewQueueResponse(
        items=items,
        total=total,
        has_more=(pagination.offset + pagination.limit) < total,
    )


# ── Match detail (side-by-side) ──


@router.get("/candidates/{candidate_id}", response_model=MatchDetailResponse)
def get_match_detail(
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get full match detail with side-by-side comparison and signal breakdowns."""
    candidate = get_or_404(db, MatchCandidate, candidate_id, label=f"Match candidate {candidate_id}")

    record_a, source_a = _load_record_detail(db, candidate.record_a_id)
    record_b, source_b = _load_record_detail(db, candidate.record_b_id)

    source_a_name = source_a.name if source_a else "Unknown"
    source_b_name = source_b.name if source_b else "Unknown"

    comparisons = compare_fields(record_a, record_b, source_a_name, source_b_name)

    return MatchDetailResponse(
        id=candidate.id,
        type=candidate.type,
        confidence=candidate.confidence,
        match_signals=candidate.match_signals,
        status=candidate.status,
        group_id=candidate.group_id,
        record_a=RecordDetail(
            id=record_a.id,
            type=record_a.type,
            name=record_a.name,
            normalized_name=record_a.normalized_name,
            fields=record_a.fields or {},
            data_source_id=record_a.data_source_id,
            data_source_name=source_a_name,
            raw_data=record_a.raw_data,
        ),
        record_b=RecordDetail(
            id=record_b.id,
            type=record_b.type,
            name=record_b.name,
            normalized_name=record_b.normalized_name,
            fields=record_b.fields or {},
            data_source_id=record_b.data_source_id,
            data_source_name=source_b_name,
            raw_data=record_b.raw_data,
        ),
        field_comparisons=[FieldComparison(**c) for c in comparisons],
        reviewed_by=candidate.reviewed_by,
        reviewed_at=candidate.reviewed_at,
        created_at=candidate.created_at,
    )


# ── Review actions ──


@router.post("/candidates/{candidate_id}/confirm", response_model=ReviewActionResponse)
def confirm_candidate(
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.REVIEWER)),
):
    """Confirm a match as a duplicate — routes candidate to the merge queue.

    Does NOT create a unified record. Field reconciliation happens separately
    via the merge step.
    """
    candidate = get_or_404(db, MatchCandidate, candidate_id, label=f"Match candidate {candidate_id}")

    if candidate.status != CandidateStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Candidate is already {candidate.status}, cannot confirm",
        )

    candidate.status = CandidateStatus.CONFIRMED
    candidate.reviewed_by = current_user.username
    candidate.reviewed_at = datetime.now(UTC)
    db.commit()

    return ReviewActionResponse(
        candidate_id=candidate.id,
        action="confirmed",
        unified_record_id=None,
    )


@router.post("/candidates/{candidate_id}/merge", response_model=ReviewActionResponse)
def merge_candidate(
    candidate_id: int,
    body: MergeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.REVIEWER)),
):
    """Confirm a match and create a unified (golden) record.

    Requires field selections for all conflicting fields.
    """
    candidate = get_or_404(db, MatchCandidate, candidate_id, label=f"Match candidate {candidate_id}")

    if candidate.status != CandidateStatus.CONFIRMED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Candidate must be confirmed before merging (current status: {candidate.status})",
        )

    record_a, source_a = _load_record_detail(db, candidate.record_a_id)
    record_b, source_b = _load_record_detail(db, candidate.record_b_id)

    source_a_name = source_a.name if source_a else "Unknown"
    source_b_name = source_b.name if source_b else "Unknown"

    try:
        unified = execute_merge(
            db=db,
            candidate=candidate,
            record_a=record_a,
            record_b=record_b,
            source_a_name=source_a_name,
            source_b_name=source_b_name,
            field_selections=[fs.model_dump() for fs in body.field_selections],
            username=current_user.username,
        )
        db.commit()
    except ValueError as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e

    return ReviewActionResponse(
        candidate_id=candidate.id,
        action="merged",
        unified_record_id=unified.id,
    )


@router.post("/candidates/{candidate_id}/reject", response_model=ReviewActionResponse)
def reject_match(
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.REVIEWER)),
):
    """Reject a match candidate — records are not duplicates."""
    candidate = get_or_404(db, MatchCandidate, candidate_id, label=f"Match candidate {candidate_id}")

    if candidate.status != CandidateStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Candidate is {candidate.status}, cannot reject",
        )

    reject_candidate(db, candidate, current_user.username)
    db.commit()

    return ReviewActionResponse(
        candidate_id=candidate.id,
        action="rejected",
    )


# ── Review stats ──


@router.get("/stats", response_model=ReviewStatsResponse)
def get_review_stats(
    type: str | None = Query(None, description="Optional filter by record type"),
    comparison_run_id: int | None = Query(None, description="Scope to a specific comparison run"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get summary stats for the review queue, optionally type-scoped."""
    cand_query = db.query(MatchCandidate)
    if type is not None:
        cand_query = cand_query.filter(MatchCandidate.type == type)
    if comparison_run_id is not None:
        cand_query = cand_query.filter(MatchCandidate.comparison_run_id == comparison_run_id)

    counts = cand_query.with_entities(
        func.count(case((MatchCandidate.status == CandidateStatus.PENDING, 1))).label("pending"),
        func.count(case((MatchCandidate.status == CandidateStatus.CONFIRMED, 1))).label("confirmed"),
        func.count(case((MatchCandidate.status == CandidateStatus.MERGED, 1))).label("merged"),
        func.count(case((MatchCandidate.status == CandidateStatus.REJECTED, 1))).label("rejected"),
    ).one()

    unified_query = db.query(func.count(UnifiedRecord.id))
    if type is not None:
        unified_query = unified_query.filter(UnifiedRecord.type == type)
    unified_count = unified_query.scalar() or 0

    return ReviewStatsResponse(
        total_pending=counts.pending,
        total_confirmed=counts.confirmed,
        total_merged=counts.merged,
        total_rejected=counts.rejected,
        total_unified=unified_count,
    )
