from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

MatchMode = Literal["FILE_VS_FILE", "FILE_VS_GOLDEN"]
MatchStatus = Literal["pending", "running", "completed", "failed", "stale"]


class BatchSummary(BaseModel):
    id: int
    filename: str


class MatchRunCreate(BaseModel):
    """Body for POST /api/matches.

    Server infers mode from `file_ids` length:
      - len == 1 → one FILE_VS_GOLDEN run (requires existing UnifiedRecords of this type)
      - len >= 2 → C(N, 2) FILE_VS_FILE runs, one per unordered pair, dispatched in parallel

    file_ids must be between 1 and 20 inclusive to prevent worker-queue flooding.
    """

    type: str
    file_ids: list[int] = Field(..., min_length=1, max_length=20)


class MatchRunResponse(BaseModel):
    id: int
    type: str
    mode: MatchMode
    status: MatchStatus
    name: str | None
    created_by: str
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    task_id: str | None
    stats: dict
    batch_ids: list[int]
    batches: list[BatchSummary] = []
    error_message: str | None = None


class MatchRunDetail(MatchRunResponse):
    candidate_counts: dict[str, int]  # {pending: N, confirmed: N, rejected: N, merged: N}


class MatchRunDispatchResponse(BaseModel):
    runs: list[MatchRunResponse]


class MatchRunStatus(BaseModel):
    task_id: str | None
    state: str
    stage: str | None
    progress: int | None
    detail: str | None
