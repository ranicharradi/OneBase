"""Matching API router — match groups, candidates, and retraining endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.dependencies import get_db, get_current_user
from app.models.user import User
from app.models.match import MatchCandidate, MatchGroup
from app.models.staging import StagedSupplier
from app.schemas.matching import (
    MatchCandidateResponse,
    MatchGroupResponse,
    RetrainResponse,
)
from app.services.retraining import retrain_weights

router = APIRouter(prefix="/api/matching", tags=["matching"])


@router.get("/groups", response_model=list[MatchGroupResponse])
def list_groups(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List match groups with candidate counts and average confidence."""
    # Subquery for candidate count and avg confidence per group
    groups = (
        db.query(
            MatchGroup.id,
            MatchGroup.created_at,
            func.count(MatchCandidate.id).label("candidate_count"),
            func.coalesce(func.avg(MatchCandidate.confidence), 0.0).label(
                "avg_confidence"
            ),
        )
        .outerjoin(MatchCandidate, MatchCandidate.group_id == MatchGroup.id)
        .group_by(MatchGroup.id)
        .order_by(MatchGroup.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return [
        MatchGroupResponse(
            id=g.id,
            candidate_count=g.candidate_count,
            avg_confidence=round(float(g.avg_confidence), 4),
            created_at=g.created_at,
        )
        for g in groups
    ]


@router.get("/candidates", response_model=list[MatchCandidateResponse])
def list_candidates(
    group_id: int | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    min_confidence: float | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List match candidates with optional filters.

    Joins to StagedSupplier to include supplier names.
    """
    # Aliases for supplier A and B
    SupA = StagedSupplier.__table__.alias("supplier_a")
    SupB = StagedSupplier.__table__.alias("supplier_b")

    query = db.query(MatchCandidate)

    if group_id is not None:
        query = query.filter(MatchCandidate.group_id == group_id)

    if status_filter is not None:
        query = query.filter(MatchCandidate.status == status_filter)

    if min_confidence is not None:
        query = query.filter(MatchCandidate.confidence >= min_confidence)

    candidates = (
        query.order_by(MatchCandidate.confidence.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    # Batch-load supplier names
    supplier_ids = set()
    for c in candidates:
        supplier_ids.add(c.supplier_a_id)
        supplier_ids.add(c.supplier_b_id)

    supplier_names: dict[int, str | None] = {}
    if supplier_ids:
        suppliers = (
            db.query(StagedSupplier.id, StagedSupplier.name)
            .filter(StagedSupplier.id.in_(supplier_ids))
            .all()
        )
        supplier_names = {s.id: s.name for s in suppliers}

    return [
        MatchCandidateResponse(
            id=c.id,
            supplier_a_id=c.supplier_a_id,
            supplier_b_id=c.supplier_b_id,
            supplier_a_name=supplier_names.get(c.supplier_a_id),
            supplier_b_name=supplier_names.get(c.supplier_b_id),
            confidence=c.confidence,
            match_signals=c.match_signals,
            status=c.status,
            group_id=c.group_id,
            created_at=c.created_at,
        )
        for c in candidates
    ]


@router.post("/retrain", response_model=RetrainResponse)
def trigger_retrain(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Trigger retraining of signal weights from reviewer decisions.

    Requires at least 20 confirmed/rejected candidates.
    """
    result = retrain_weights(db)

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Insufficient reviewed data — need at least 20 confirmed/rejected candidates",
        )

    return RetrainResponse(
        weights=result["weights"],
        sample_count=result["sample_count"],
    )
