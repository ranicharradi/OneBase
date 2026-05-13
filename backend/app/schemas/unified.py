"""Pydantic v2 schemas for unified records, dashboard, and export."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

# ── Unified record list/detail ──


class FieldProvenance(BaseModel):
    """Provenance for a single field in a unified record."""

    value: str | None = None
    source_entity: str | None = None
    source_record_id: int | None = None
    auto: bool = False
    chosen_by: str | None = None
    chosen_at: str | None = None


class UnifiedRecordListItem(BaseModel):
    """Compact unified record for list view."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    name: str
    fields: dict[str, Any] = {}
    source_count: int  # number of source records merged
    is_singleton: bool  # promoted directly (no match candidate)
    created_by: str
    created_at: datetime | None = None
    dq_completeness: float | None = None
    dq_validity: float | None = None
    dq_score: float | None = None


class UnifiedRecordListResponse(BaseModel):
    """Paginated unified record list."""

    items: list[UnifiedRecordListItem]
    total: int
    has_more: bool


class SourceRecord(BaseModel):
    """Source record linked to a unified record."""

    id: int
    type: str
    name: str | None = None
    fields: dict[str, Any] = {}
    data_source_name: str | None = None
    data_source_id: int


class MergeHistoryEntry(BaseModel):
    """Audit log entry related to this unified record."""

    id: int
    action: str
    details: dict[str, Any] | None = None
    created_at: datetime | None = None


class UnifiedRecordDetail(BaseModel):
    """Full unified record with provenance, source records, and merge history."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    name: str
    fields: dict[str, Any] = {}
    provenance: dict[str, FieldProvenance]
    source_record_ids: list[int]
    source_records: list[SourceRecord]
    match_candidate_id: int | None = None
    merge_history: list[MergeHistoryEntry]
    created_by: str
    created_at: datetime | None = None
    dq_completeness: float | None = None
    dq_validity: float | None = None
    dq_score: float | None = None


# ── Singleton promotion ──


class SingletonCandidate(BaseModel):
    """Staged record eligible for singleton promotion."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    name: str | None = None
    fields: dict[str, Any] = {}
    data_source_id: int
    data_source_name: str | None = None


class SingletonListResponse(BaseModel):
    """Paginated singleton candidates."""

    items: list[SingletonCandidate]
    total: int
    has_more: bool


class PromoteResponse(BaseModel):
    """Response after promoting a singleton."""

    unified_record_id: int
    record_name: str
    message: str


class BulkPromoteRequest(BaseModel):
    """Request to promote multiple singletons at once."""

    record_ids: list[int]


class BulkPromoteResponse(BaseModel):
    """Response after bulk promotion."""

    promoted_count: int
    unified_record_ids: list[int]


# ── Dashboard ──


class UploadStats(BaseModel):
    total_batches: int
    completed: int
    failed: int
    total_staged: int


class MatchStats(BaseModel):
    total_candidates: int
    total_groups: int
    avg_confidence: float | None = None


class ReviewProgress(BaseModel):
    pending: int
    confirmed: int
    rejected: int


class UnifiedStats(BaseModel):
    total_unified: int
    merged: int  # from match candidates
    singletons: int  # promoted directly


class RecentActivity(BaseModel):
    id: int
    action: str
    entity_type: str | None = None
    entity_id: int | None = None
    entity_name: str | None = None
    details: dict[str, Any] | None = None
    created_at: datetime | None = None


class DashboardResponse(BaseModel):
    uploads: UploadStats
    matching: MatchStats
    review: ReviewProgress
    unified: UnifiedStats
    recent_activity: list[RecentActivity]
