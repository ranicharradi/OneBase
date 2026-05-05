"""Matching API router — match groups, candidates, and retraining endpoints, type-scoped."""

import contextlib

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db, require_role
from app.models.enums import UserRole
from app.models.match import MatchCandidate, MatchGroup
from app.models.staging import StagedRecord
from app.models.user import User
from app.record_types import get as get_record_type
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
    extract_blocker_training_data,
    extract_training_data,
    save_model,
    scorer_feature_names,
    train_model,
)
from app.services.retraining import retrain_weights
from app.services.scoring import signal_key

router = APIRouter(prefix="/api/matching", tags=["matching"])


@router.get("/groups", response_model=list[MatchGroupResponse])
def list_groups(
    type: str | None = Query(None, description="Filter by record type"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List match groups with candidate counts and average confidence."""
    base = (
        db.query(
            MatchGroup.id,
            MatchGroup.type,
            MatchGroup.created_at,
            func.count(MatchCandidate.id).label("candidate_count"),
            func.coalesce(func.avg(MatchCandidate.confidence), 0.0).label("avg_confidence"),
        )
        .outerjoin(MatchCandidate, MatchCandidate.group_id == MatchGroup.id)
        .group_by(MatchGroup.id)
        .order_by(MatchGroup.created_at.desc())
    )
    if type is not None:
        base = base.filter(MatchGroup.type == type)

    groups = base.offset(offset).limit(limit).all()

    return [
        MatchGroupResponse(
            id=g.id,
            type=g.type,
            candidate_count=g.candidate_count,
            avg_confidence=round(float(g.avg_confidence), 4),
            created_at=g.created_at,
        )
        for g in groups
    ]


@router.get("/candidates", response_model=list[MatchCandidateResponse])
def list_candidates(
    type: str | None = Query(None, description="Filter by record type"),
    group_id: int | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    min_confidence: float | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List match candidates with optional filters."""
    query = db.query(MatchCandidate)

    if type is not None:
        query = query.filter(MatchCandidate.type == type)
    if group_id is not None:
        query = query.filter(MatchCandidate.group_id == group_id)
    if status_filter is not None:
        query = query.filter(MatchCandidate.status == status_filter)
    if min_confidence is not None:
        query = query.filter(MatchCandidate.confidence >= min_confidence)

    candidates = query.order_by(MatchCandidate.confidence.desc()).offset(offset).limit(limit).all()

    record_ids = set()
    for c in candidates:
        record_ids.add(c.record_a_id)
        record_ids.add(c.record_b_id)

    record_names: dict[int, str | None] = {}
    if record_ids:
        rows = db.query(StagedRecord.id, StagedRecord.name).filter(StagedRecord.id.in_(record_ids)).all()
        record_names = {r.id: r.name for r in rows}

    return [
        MatchCandidateResponse(
            id=c.id,
            type=c.type,
            record_a_id=c.record_a_id,
            record_b_id=c.record_b_id,
            record_a_name=record_names.get(c.record_a_id),
            record_b_name=record_names.get(c.record_b_id),
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
    type: str = Query(..., description="Record type key"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get current ML model and weight retraining status for a record type."""
    from app.models.ml_model import MLModelVersion

    try:
        rt = get_record_type(type)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown record type: {type!r}",
        ) from None

    scorer = (
        db.query(MLModelVersion)
        .filter(
            MLModelVersion.model_type == "scorer",
            MLModelVersion.record_type == type,
        )
        .order_by(MLModelVersion.created_at.desc())
        .first()
    )

    review_count = (
        db.query(func.count(MatchCandidate.id))
        .filter(
            MatchCandidate.type == type,
            MatchCandidate.status.in_(["confirmed", "rejected"]),
        )
        .scalar()
        or 0
    )

    # Current weights live in the type config
    current_weights = {signal_key(s.kind, s.field): s.weight for s in rt.signals}

    return {
        "type": type,
        "last_trained": scorer.created_at.isoformat() if scorer else None,
        "last_retrained": None,
        "review_count": review_count,
        "current_weights": current_weights,
        "ml_model_exists": scorer is not None,
    }


@router.post("/retrain", response_model=RetrainResponse)
def trigger_retrain(
    type: str = Query(..., description="Record type key"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Trigger retraining of signal weights from reviewer decisions, scoped to a type.

    Requires at least 20 confirmed/rejected candidates for the type.
    """
    try:
        get_record_type(type)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown record type: {type!r}",
        ) from None

    result = retrain_weights(db, type)

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Insufficient reviewed data — need at least 20 confirmed/rejected candidates",
        )

    return RetrainResponse(
        type=type,
        weights=result["weights"],
        sample_count=result["sample_count"],
    )


@router.post("/train-model", response_model=TrainModelResponse)
def train_ml_model(
    type: str = Query(..., description="Record type key"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Train ML scorer and blocker models for a record type from reviewed candidates.

    Requires at least 50 confirmed/rejected candidates of the type with both classes present.
    Acquires a PostgreSQL advisory lock to prevent concurrent training.
    """
    try:
        get_record_type(type)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown record type: {type!r}",
        ) from None

    with contextlib.suppress(Exception):
        db.execute(text("SELECT pg_advisory_xact_lock(737373)"))

    X_scorer, y = extract_training_data(db, type)

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

    scorer_feature_list = scorer_feature_names(type)
    scorer_result = train_model(X_scorer, y, scorer_feature_list, model_type="scorer")
    scorer_version = save_model(
        model=scorer_result["model"],
        model_type="scorer",
        record_type_key=type,
        feature_names=scorer_feature_list,
        metrics=scorer_result["metrics"],
        feature_importances=scorer_result["feature_importances"],
        sample_count=len(y),
        db=db,
        created_by=current_user.username,
    )

    X_blocker, y_blocker = extract_blocker_training_data(db, type)
    blocker_result = train_model(X_blocker, y_blocker, BLOCKER_FEATURE_NAMES, model_type="blocker")
    blocker_version = save_model(
        model=blocker_result["model"],
        model_type="blocker",
        record_type_key=type,
        feature_names=BLOCKER_FEATURE_NAMES,
        metrics=blocker_result["metrics"],
        feature_importances=blocker_result["feature_importances"],
        sample_count=len(y_blocker),
        db=db,
        created_by=current_user.username,
    )

    db.commit()

    return TrainModelResponse(
        type=type,
        scorer=ModelTrainingResult(
            model_id=scorer_version.id,
            sample_count=len(y),
            metrics=scorer_result["metrics"],
            feature_importances=scorer_result["feature_importances"],
            threshold=scorer_result["metrics"]["threshold"],
        ),
        blocker=ModelTrainingResult(
            model_id=blocker_version.id,
            sample_count=len(y_blocker),
            metrics=blocker_result["metrics"],
            feature_importances=blocker_result["feature_importances"],
            threshold=blocker_result["metrics"]["threshold"],
        ),
    )
