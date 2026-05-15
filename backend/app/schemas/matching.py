"""Pydantic v2 schemas for matching API responses."""

from datetime import datetime

from pydantic import BaseModel

from app.schemas import APIResponse


class MatchCandidateResponse(APIResponse):
    """Response schema for a match candidate."""

    id: int
    type: str
    record_a_id: int
    record_b_id: int
    record_a_name: str | None = None
    record_b_name: str | None = None
    confidence: float
    # match_signals is a free-form dict because per-type signal vectors differ.
    # Keys are typically formatted as "{kind}:{field}".
    match_signals: dict[str, float]
    status: str
    group_id: int | None = None
    created_at: datetime | None = None


class MatchGroupResponse(APIResponse):
    """Response schema for a match group with candidate count."""

    id: int
    type: str
    candidate_count: int
    avg_confidence: float
    created_at: datetime | None = None


class RetrainResponse(BaseModel):
    """Response schema for retraining results."""

    type: str
    weights: dict[str, float]
    sample_count: int


class ModelTrainingResult(BaseModel):
    """Result for a single model (scorer or blocker)."""

    model_id: int
    sample_count: int
    metrics: dict
    feature_importances: dict | None = None
    threshold: float


class TrainModelResponse(BaseModel):
    """Response from ML model training."""

    type: str
    scorer: ModelTrainingResult
    blocker: ModelTrainingResult
