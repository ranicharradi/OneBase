"""Pydantic v2 schemas for unified suppliers, dashboard, and export."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

# ── Unified supplier list/detail ──


class FieldProvenance(BaseModel):
    """Provenance for a single field in a unified record."""

    value: str | None = None
    source_entity: str | None = None
    source_record_id: int | None = None
    auto: bool = False
    chosen_by: str | None = None
    chosen_at: str | None = None


class UnifiedSupplierListItem(BaseModel):
    """Compact unified supplier for list view."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    source_code: str | None = None
    short_name: str | None = None
    currency: str | None = None
    supplier_type: str | None = None
    source_count: int  # number of source records merged
    is_singleton: bool  # promoted directly (no match candidate)
    created_by: str
    created_at: datetime | None = None


class UnifiedSupplierListResponse(BaseModel):
    """Paginated unified supplier list."""

    items: list[UnifiedSupplierListItem]
    total: int
    has_more: bool


class SourceRecord(BaseModel):
    """Source record linked to a unified supplier."""

    id: int
    name: str | None = None
    source_code: str | None = None
    data_source_name: str | None = None
    data_source_id: int


class MergeHistoryEntry(BaseModel):
    """Audit log entry related to this unified record."""

    id: int
    action: str
    details: dict[str, Any] | None = None
    created_at: datetime | None = None


class UnifiedSupplierDetail(BaseModel):
    """Full unified supplier with provenance, source records, and merge history."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    source_code: str | None = None
    short_name: str | None = None
    currency: str | None = None
    payment_terms: str | None = None
    contact_name: str | None = None
    supplier_type: str | None = None
    provenance: dict[str, FieldProvenance]
    source_supplier_ids: list[int]
    source_records: list[SourceRecord]
    match_candidate_id: int | None = None
    merge_history: list[MergeHistoryEntry]
    created_by: str
    created_at: datetime | None = None


# ── Singleton promotion ──


class SingletonCandidate(BaseModel):
    """Staged supplier eligible for singleton promotion."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str | None = None
    source_code: str | None = None
    short_name: str | None = None
    currency: str | None = None
    payment_terms: str | None = None
    contact_name: str | None = None
    supplier_type: str | None = None
    data_source_id: int
    data_source_name: str | None = None


class SingletonListResponse(BaseModel):
    """Paginated singleton candidates."""

    items: list[SingletonCandidate]
    total: int
    has_more: bool


class PromoteResponse(BaseModel):
    """Response after promoting a singleton."""

    unified_supplier_id: int
    supplier_name: str
    message: str


class BulkPromoteRequest(BaseModel):
    """Request to promote multiple singletons at once."""

    supplier_ids: list[int]


class BulkPromoteResponse(BaseModel):
    """Response after bulk promotion."""

    promoted_count: int
    unified_supplier_ids: list[int]


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
