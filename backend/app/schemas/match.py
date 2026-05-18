from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

MatchMode = Literal["FILE_VS_FILE", "FILE_VS_GOLDEN"]
MatchStatus = Literal["pending", "running", "completed", "failed", "stale"]


class BatchSummary(BaseModel):
    id: int
    data_source_id: int
    data_source_name: str
    original_filename: str
    file_extension: str


class SourceSummary(BaseModel):
    id: int
    name: str


class MatchRunCreate(BaseModel):
    """Body for POST /api/matches.

    Provide `source_ids` (preferred) — the router resolves each to the source's
    latest COMPLETED batch. `file_ids` is kept for the existing test surface;
    exactly one of the two must be set.
    """

    type: str
    source_ids: list[int] = Field(default_factory=list, max_length=20)
    file_ids: list[int] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def _exactly_one_id_set(self):
        if bool(self.source_ids) == bool(self.file_ids):
            raise ValueError("provide exactly one of source_ids or file_ids")
        return self


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
    sources: list[SourceSummary] = []
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
