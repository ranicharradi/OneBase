"""Response schemas for the Insights tab."""

from pydantic import BaseModel


class BucketCount(BaseModel):
    bucket: str
    count: int


class PerSourceDq(BaseModel):
    source_id: int
    source_name: str
    count: int
    avg_dq: float


class WorstRecord(BaseModel):
    id: int
    record_type: str
    source_name: str | None
    dq_score: float
    dq_completeness: float | None
    dq_validity: float | None


class InsightsDqResponse(BaseModel):
    avg_dq: float
    distribution: list[BucketCount]
    per_source: list[PerSourceDq]
    worst: list[WorstRecord]
