from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ComparisonMode = Literal["FILE_VS_FILE", "FILE_VS_GOLDEN", "MULTI_FILE"]
ComparisonStatus = Literal["pending", "running", "completed", "failed", "stale"]


class ComparisonRunCreate(BaseModel):
    type: str
    mode: ComparisonMode
    batch_ids: list[int] = Field(..., min_length=1)
    name: str | None = None


class ComparisonRunResponse(BaseModel):
    id: int
    type: str
    mode: ComparisonMode
    status: ComparisonStatus
    name: str | None
    created_by: str
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    task_id: str | None
    stats: dict
    batch_ids: list[int]
    error_message: str | None = None


class ComparisonRunDetail(ComparisonRunResponse):
    candidate_counts: dict[str, int]  # {pending: N, confirmed: N, rejected: N, merged: N}


class ComparisonRunStatus(BaseModel):
    task_id: str | None
    state: str
    stage: str | None
    progress: int | None
    detail: str | None
