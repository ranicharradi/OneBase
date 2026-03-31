"""Matching API router — match groups, candidates, and retraining endpoints."""

import contextlib

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db, require_role
from app.models.enums import UserRole
from app.models.match import MatchCandidate, MatchGroup
from app.models.staging import StagedSupplier
from app.models.user import User
from app.schemas.matching import (
    MatchCandidateResponse,
    MatchGroupResponse,
    ModelTrainingResult,
    RetrainResponse,
    TrainModelResponse,
)
from app.services.ml_training import (
    BLOCKER_FEATURE_NAMES,
    MIN_TRAINING_SAMPLES,
    SCORER_FEATURE_NAMES,
    extract_training_data,
    save_model,
    train_model,
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
            func.coalesce(func.avg(MatchCandidate.confidence), 0.0).label("avg_confidence"),
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
    query = db.query(MatchCandidate)

    if group_id is not None:
        query = query.filter(MatchCandidate.group_id == group_id)

    if status_filter is not None:
        query = query.filter(MatchCandidate.status == status_filter)

    if min_confidence is not None:
        query = query.filter(MatchCandidate.confidence >= min_confidence)

    candidates = query.order_by(MatchCandidate.confidence.desc()).offset(offset).limit(limit).all()

    # Batch-load supplier names
    supplier_ids = set()
    for c in candidates:
        supplier_ids.add(c.supplier_a_id)
        supplier_ids.add(c.supplier_b_id)

    supplier_names: dict[int, str | None] = {}
    if supplier_ids:
        suppliers = db.query(StagedSupplier.id, StagedSupplier.name).filter(StagedSupplier.id.in_(supplier_ids)).all()
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


@router.get("/model-status")
def get_model_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get current ML model and weight retraining status."""
    from app.config import settings
    from app.models.ml_model import MLModelVersion

    # Latest scorer model
    scorer = (
        db.query(MLModelVersion)
        .filter(MLModelVersion.model_type == "scorer")
        .order_by(MLModelVersion.created_at.desc())
        .first()
    )

    # Count reviewed candidates
    review_count = (
        db.query(func.count(MatchCandidate.id)).filter(MatchCandidate.status.in_(["confirmed", "rejected"])).scalar()
        or 0
    )

    # Current weights from config
    current_weights = {
        "jaro_winkler": settings.matching_weight_jaro_winkler,
        "token_jaccard": settings.matching_weight_token_jaccard,
        "embedding_cosine": settings.matching_weight_embedding_cosine,
        "short_name": settings.matching_weight_short_name,
        "currency": settings.matching_weight_currency,
        "contact": settings.matching_weight_contact,
    }

    return {
        "last_trained": scorer.created_at.isoformat() if scorer else None,
        "last_retrained": None,
        "review_count": review_count,
        "current_weights": current_weights,
        "ml_model_exists": scorer is not None,
    }


@router.post("/retrain", response_model=RetrainResponse)
def trigger_retrain(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
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


@router.post("/train-model", response_model=TrainModelResponse)
def train_ml_model(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Train ML scorer and blocker models from reviewed match candidates.

    Requires at least 50 confirmed/rejected candidates with both classes present.
    Acquires a PostgreSQL advisory lock to prevent concurrent training.
    """
    # Advisory lock to prevent concurrent training (skip on SQLite)
    with contextlib.suppress(Exception):
        db.execute(text("SELECT pg_advisory_xact_lock(737373)"))

    # Extract training data
    X, y = extract_training_data(db)

    if len(y) < MIN_TRAINING_SAMPLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient training data — need at least {MIN_TRAINING_SAMPLES} "
            f"reviewed candidates, found {len(y)}",
        )

    if len(set(y)) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Training data must include both confirmed and rejected candidates",
        )

    # Train scorer (all 8 features)
    scorer_result = train_model(X, y, model_type="scorer")
    scorer_version = save_model(
        model=scorer_result["model"],
        model_type="scorer",
        feature_names=SCORER_FEATURE_NAMES,
        metrics=scorer_result["metrics"],
        feature_importances=scorer_result["feature_importances"],
        sample_count=len(y),
        db=db,
        created_by=current_user.username,
    )

    # Train blocker (3 fast features: jaro_winkler, token_jaccard, name_length_ratio)
    X_blocker = X[:, [0, 1, 6]]  # indices for jaro_winkler, token_jaccard, name_length_ratio
    blocker_result = train_model(X_blocker, y, model_type="blocker")
    blocker_version = save_model(
        model=blocker_result["model"],
        model_type="blocker",
        feature_names=BLOCKER_FEATURE_NAMES,
        metrics=blocker_result["metrics"],
        feature_importances=blocker_result["feature_importances"],
        sample_count=len(y),
        db=db,
        created_by=current_user.username,
    )

    db.commit()

    return TrainModelResponse(
        scorer=ModelTrainingResult(
            model_id=scorer_version.id,
            sample_count=len(y),
            metrics=scorer_result["metrics"],
            feature_importances=scorer_result["feature_importances"],
            threshold=scorer_result["metrics"]["threshold"],
        ),
        blocker=ModelTrainingResult(
            model_id=blocker_version.id,
            sample_count=len(y),
            metrics=blocker_result["metrics"],
            feature_importances=blocker_result["feature_importances"],
            threshold=blocker_result["metrics"]["threshold"],
        ),
    )
