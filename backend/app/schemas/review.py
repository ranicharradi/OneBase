"""Pydantic v2 schemas for review queue, match detail, and merge operations."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

# ── Record detail for side-by-side comparison ──


class RecordDetail(BaseModel):
    """Full staged-record detail for side-by-side view.

    `fields` holds the type-specific JSONB; the frontend renders it dynamically
    using `/api/record-types/{type}` metadata.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    name: str | None = None
    normalized_name: str | None = None
    fields: dict[str, Any] = {}
    data_source_id: int
    data_source_name: str | None = None
    raw_data: dict[str, Any] | None = None


# ── Match detail (side-by-side with signals) ──


class FieldComparison(BaseModel):
    """Comparison of a single field across two records."""

    field: str
    label: str
    value_a: str | None = None
    value_b: str | None = None
    source_a: str | None = None  # data source name
    source_b: str | None = None
    is_conflict: bool = False
    is_identical: bool = False
    is_a_only: bool = False
    is_b_only: bool = False


class MatchDetailResponse(BaseModel):
    """Full match detail with side-by-side comparison and signal breakdowns."""

    id: int
    type: str
    confidence: float
    match_signals: dict[str, float]
    status: str
    group_id: int | None = None
    record_a: RecordDetail
    record_b: RecordDetail
    field_comparisons: list[FieldComparison]
    reviewed_by: str | None = None
    reviewed_at: datetime | None = None
    created_at: datetime | None = None


# ── Review queue item (enriched candidate) ──


class ReviewQueueItem(BaseModel):
    """Match candidate enriched for the review queue."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    record_a_id: int
    record_b_id: int
    record_a_name: str | None = None
    record_b_name: str | None = None
    record_a_source: str | None = None
    record_b_source: str | None = None
    record_a_fields: dict[str, Any] = {}
    record_b_fields: dict[str, Any] = {}
    confidence: float
    match_signals: dict[str, float] = {}
    status: str
    group_id: int | None = None
    created_at: datetime | None = None
    reviewed_by: str | None = None
    reviewed_at: datetime | None = None


class ReviewQueueResponse(BaseModel):
    """Paginated review queue response."""

    items: list[ReviewQueueItem]
    total: int
    has_more: bool


# ── Review actions (confirm/reject) ──


class FieldSelection(BaseModel):
    """User's choice for a conflicting field."""

    field: str
    chosen_record_id: int


class MergeRequest(BaseModel):
    """Request to confirm a merge with field selections for conflicts."""

    field_selections: list[FieldSelection] = []


class ReviewActionResponse(BaseModel):
    """Response after a review action (merge/reject)."""

    candidate_id: int
    action: str
    unified_record_id: int | None = None  # set if merged


# ── Unified record response ──


class FieldProvenance(BaseModel):
    """Provenance for a single field in a unified record."""

    value: str | None = None
    source_entity: str | None = None
    source_record_id: int | None = None
    auto: bool = False
    chosen_by: str | None = None
    chosen_at: str | None = None


class UnifiedRecordResponse(BaseModel):
    """Response schema for a unified (golden) record."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    name: str
    fields: dict[str, Any] = {}
    provenance: dict[str, FieldProvenance]
    source_record_ids: list[int]
    match_candidate_id: int | None = None
    created_by: str
    created_at: datetime | None = None


# ── Review stats ──


class ReviewStatsResponse(BaseModel):
    """Summary stats for the review queue."""

    total_pending: int
    total_confirmed: int
    total_merged: int
    total_rejected: int
    total_unified: int
