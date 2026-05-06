"""Unified (golden record) model with full field-level provenance."""

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, func

from app.models.base import Base


class UnifiedRecord(Base):
    """Golden record produced by merging matched StagedRecords of the same type.

    `fields` holds the merged values keyed by FieldDef.key.
    `provenance` mirrors `fields`: per key, the source record id, reviewer, and timestamp.
    """

    __tablename__ = "unified_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    type = Column(String(50), nullable=False)
    name = Column(String(255), nullable=False)
    fields = Column(JSON, nullable=False, default=dict)
    provenance = Column(JSON, nullable=False, default=dict)
    source_record_ids = Column(JSON, nullable=False, default=list)  # list[int]
    match_candidate_id = Column(Integer, ForeignKey("match_candidates.id"), nullable=True)
    created_by = Column(String(100), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
