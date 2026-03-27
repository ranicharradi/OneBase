"""Pydantic v2 schemas for matching API responses."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MatchSignals(BaseModel):
    """Individual signal scores from multi-signal matching."""

    jaro_winkler: float
    token_jaccard: float
    embedding_cosine: float
    short_name_match: float
    currency_match: float
    contact_match: float


class MatchCandidateResponse(BaseModel):
    """Response schema for a match candidate."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    supplier_a_id: int
    supplier_b_id: int
    supplier_a_name: str | None = None
    supplier_b_name: str | None = None
    confidence: float
    match_signals: MatchSignals
    status: str
    group_id: int | None = None
    created_at: datetime | None = None


class MatchGroupResponse(BaseModel):
    """Response schema for a match group with candidate count."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    candidate_count: int
    avg_confidence: float
    created_at: datetime | None = None


class RetrainResponse(BaseModel):
    """Response schema for retraining results."""

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

    scorer: ModelTrainingResult
    blocker: ModelTrainingResult
