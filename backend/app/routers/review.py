"""Review & merge API router — review queue, match detail, and merge/reject/skip actions."""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, case
from sqlalchemy.orm import Session

from app.dependencies import get_db, get_current_user
from app.models.user import User
from app.models.match import MatchCandidate
from app.models.staging import StagedSupplier
from app.models.source import DataSource
from app.models.unified import UnifiedSupplier
from app.schemas.review import (
    ReviewQueueItem,
    ReviewQueueResponse,
    MatchDetailResponse,
    FieldComparison,
    SupplierDetail,
    MergeRequest,
    ReviewActionResponse,
    ReviewStatsResponse,
    UnifiedSupplierResponse,
    FieldProvenance,
)
from app.services.merge import (
    compare_fields,
    execute_merge,
    reject_candidate,
    skip_candidate,
)

router = APIRouter(prefix="/api/review", tags=["review"])


def _load_supplier_detail(
    db: Session, supplier_id: int
) -> tuple[StagedSupplier, DataSource]:
    """Load a staged supplier and its data source."""
    supplier = db.get(StagedSupplier, supplier_id)
    if not supplier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Staged supplier {supplier_id} not found",
        )
    source = db.get(DataSource, supplier.data_source_id)
    return supplier, source


# ── Review queue ──


@router.get("/queue", response_model=ReviewQueueResponse)
def get_review_queue(
    status_filter: str = Query("pending", alias="status"),
    source_a_id: int | None = Query(None, description="Filter by supplier A source"),
    source_b_id: int | None = Query(None, description="Filter by supplier B source"),
    min_confidence: float | None = Query(None, ge=0.0, le=1.0),
    max_confidence: float | None = Query(None, ge=0.0, le=1.0),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    sort: Literal["confidence_desc", "confidence_asc", "active_learning"] = Query(
        "confidence_desc", description="Sort order for the queue"
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get paginated review queue with filtering."""
    # Base query
    query = db.query(MatchCandidate)

    if status_filter:
        query = query.filter(MatchCandidate.status == status_filter)

    if min_confidence is not None:
        query = query.filter(MatchCandidate.confidence >= min_confidence)

    if max_confidence is not None:
        query = query.filter(MatchCandidate.confidence <= max_confidence)

    # Source pair filtering — requires joins to staged suppliers
    if source_a_id is not None or source_b_id is not None:
        SupA = (
            db.query(StagedSupplier.id, StagedSupplier.data_source_id)
            .subquery("sup_a")
        )
        SupB = (
            db.query(StagedSupplier.id, StagedSupplier.data_source_id)
            .subquery("sup_b")
        )
        query = query.join(SupA, MatchCandidate.supplier_a_id == SupA.c.id)
        query = query.join(SupB, MatchCandidate.supplier_b_id == SupB.c.id)

        if source_a_id is not None and source_b_id is not None:
            # Either direction: (A in source_a, B in source_b) OR (A in source_b, B in source_a)
            query = query.filter(
                (
                    (SupA.c.data_source_id == source_a_id)
                    & (SupB.c.data_source_id == source_b_id)
                )
                | (
                    (SupA.c.data_source_id == source_b_id)
                    & (SupB.c.data_source_id == source_a_id)
                )
            )
        elif source_a_id is not None:
            query = query.filter(
                (SupA.c.data_source_id == source_a_id)
                | (SupB.c.data_source_id == source_a_id)
            )
        elif source_b_id is not None:
            query = query.filter(
                (SupA.c.data_source_id == source_b_id)
                | (SupB.c.data_source_id == source_b_id)
            )

    total = query.count()

    # Apply sort order
    if sort == "confidence_asc":
        query = query.order_by(MatchCandidate.confidence.asc())
    elif sort == "active_learning":
        query = query.order_by(func.abs(MatchCandidate.confidence - 0.5).asc())
    else:  # confidence_desc (default)
        query = query.order_by(MatchCandidate.confidence.desc())

    candidates = (
        query.offset(offset)
        .limit(limit)
        .all()
    )

    # Batch-load supplier info
    supplier_ids = set()
    for c in candidates:
        supplier_ids.add(c.supplier_a_id)
        supplier_ids.add(c.supplier_b_id)

    supplier_info: dict[int, tuple[str | None, str | None]] = {}
    if supplier_ids:
        rows = (
            db.query(
                StagedSupplier.id,
                StagedSupplier.name,
                DataSource.name.label("source_name"),
            )
            .join(DataSource, StagedSupplier.data_source_id == DataSource.id)
            .filter(StagedSupplier.id.in_(supplier_ids))
            .all()
        )
        supplier_info = {r.id: (r.name, r.source_name) for r in rows}

    items = []
    for c in candidates:
        a_info = supplier_info.get(c.supplier_a_id, (None, None))
        b_info = supplier_info.get(c.supplier_b_id, (None, None))
        items.append(
            ReviewQueueItem(
                id=c.id,
                supplier_a_id=c.supplier_a_id,
                supplier_b_id=c.supplier_b_id,
                supplier_a_name=a_info[0],
                supplier_b_name=b_info[0],
                supplier_a_source=a_info[1],
                supplier_b_source=b_info[1],
                confidence=c.confidence,
                status=c.status,
                group_id=c.group_id,
                created_at=c.created_at,
            )
        )

    return ReviewQueueResponse(
        items=items,
        total=total,
        has_more=(offset + limit) < total,
    )


# ── Match detail (side-by-side) ──


@router.get("/candidates/{candidate_id}", response_model=MatchDetailResponse)
def get_match_detail(
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get full match detail with side-by-side comparison and signal breakdowns."""
    candidate = db.get(MatchCandidate, candidate_id)
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Match candidate {candidate_id} not found",
        )

    supplier_a, source_a = _load_supplier_detail(db, candidate.supplier_a_id)
    supplier_b, source_b = _load_supplier_detail(db, candidate.supplier_b_id)

    source_a_name = source_a.name if source_a else "Unknown"
    source_b_name = source_b.name if source_b else "Unknown"

    # Build field comparisons
    comparisons = compare_fields(supplier_a, supplier_b, source_a_name, source_b_name)

    return MatchDetailResponse(
        id=candidate.id,
        confidence=candidate.confidence,
        match_signals=candidate.match_signals,
        status=candidate.status,
        group_id=candidate.group_id,
        supplier_a=SupplierDetail(
            id=supplier_a.id,
            source_code=supplier_a.source_code,
            name=supplier_a.name,
            short_name=supplier_a.short_name,
            currency=supplier_a.currency,
            payment_terms=supplier_a.payment_terms,
            contact_name=supplier_a.contact_name,
            supplier_type=supplier_a.supplier_type,
            normalized_name=supplier_a.normalized_name,
            data_source_id=supplier_a.data_source_id,
            data_source_name=source_a_name,
            raw_data=supplier_a.raw_data,
        ),
        supplier_b=SupplierDetail(
            id=supplier_b.id,
            source_code=supplier_b.source_code,
            name=supplier_b.name,
            short_name=supplier_b.short_name,
            currency=supplier_b.currency,
            payment_terms=supplier_b.payment_terms,
            contact_name=supplier_b.contact_name,
            supplier_type=supplier_b.supplier_type,
            normalized_name=supplier_b.normalized_name,
            data_source_id=supplier_b.data_source_id,
            data_source_name=source_b_name,
            raw_data=supplier_b.raw_data,
        ),
        field_comparisons=[FieldComparison(**c) for c in comparisons],
        reviewed_by=candidate.reviewed_by,
        reviewed_at=candidate.reviewed_at,
        created_at=candidate.created_at,
    )


# ── Review actions ──


@router.post(
    "/candidates/{candidate_id}/merge", response_model=ReviewActionResponse
)
def merge_candidate(
    candidate_id: int,
    body: MergeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Confirm a match and create a unified (golden) supplier record.

    Requires field selections for all conflicting fields.
    Identical and source-only fields are auto-included.
    """
    candidate = db.get(MatchCandidate, candidate_id)
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Match candidate {candidate_id} not found",
        )

    if candidate.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Candidate is already {candidate.status}, cannot merge",
        )

    supplier_a, source_a = _load_supplier_detail(db, candidate.supplier_a_id)
    supplier_b, source_b = _load_supplier_detail(db, candidate.supplier_b_id)

    source_a_name = source_a.name if source_a else "Unknown"
    source_b_name = source_b.name if source_b else "Unknown"

    try:
        unified = execute_merge(
            db=db,
            candidate=candidate,
            supplier_a=supplier_a,
            supplier_b=supplier_b,
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
        )

    return ReviewActionResponse(
        candidate_id=candidate.id,
        action="merged",
        unified_supplier_id=unified.id,
    )


@router.post(
    "/candidates/{candidate_id}/reject", response_model=ReviewActionResponse
)
def reject_match(
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reject a match candidate — suppliers are not duplicates."""
    candidate = db.get(MatchCandidate, candidate_id)
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Match candidate {candidate_id} not found",
        )

    if candidate.status not in ("pending", "skipped"):
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


@router.post(
    "/candidates/{candidate_id}/skip", response_model=ReviewActionResponse
)
def skip_match(
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Skip a match candidate for later review."""
    candidate = db.get(MatchCandidate, candidate_id)
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Match candidate {candidate_id} not found",
        )

    if candidate.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Candidate is {candidate.status}, cannot skip",
        )

    skip_candidate(db, candidate, current_user.username)
    db.commit()

    return ReviewActionResponse(
        candidate_id=candidate.id,
        action="skipped",
    )


# ── Review stats ──


@router.get("/stats", response_model=ReviewStatsResponse)
def get_review_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get summary stats for the review queue."""
    counts = (
        db.query(
            func.count(case((MatchCandidate.status == "pending", 1))).label(
                "pending"
            ),
            func.count(case((MatchCandidate.status == "confirmed", 1))).label(
                "confirmed"
            ),
            func.count(case((MatchCandidate.status == "rejected", 1))).label(
                "rejected"
            ),
            func.count(case((MatchCandidate.status == "skipped", 1))).label(
                "skipped"
            ),
        )
        .one()
    )

    unified_count = db.query(func.count(UnifiedSupplier.id)).scalar() or 0

    return ReviewStatsResponse(
        total_pending=counts.pending,
        total_confirmed=counts.confirmed,
        total_rejected=counts.rejected,
        total_skipped=counts.skipped,
        total_unified=unified_count,
    )
