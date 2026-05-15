"""Unified (golden record) model with full field-level provenance."""

from sqlalchemy import Column, DateTime, Float, Index, Integer, LargeBinary, String, func

try:
    from pgvector.sqlalchemy import Vector
except ImportError:
    Vector = None

from app.models.base import Base, json_type


class UnifiedRecord(Base):
    """Golden record produced by merging matched StagedRecords of the same type."""

    __tablename__ = "unified_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    type = Column(String(50), nullable=False)
    name = Column(String(255), nullable=False)
    normalized_name = Column(String(255), nullable=True)
    name_embedding = Column(Vector(384) if Vector else LargeBinary, nullable=True)
    fields = Column(json_type(), nullable=False, default=dict)
    provenance = Column(json_type(), nullable=False, default=dict)
    source_record_ids = Column(json_type(), nullable=False, default=list)
    dq_completeness = Column(Float, nullable=True)
    dq_validity = Column(Float, nullable=True)
    dq_score = Column(Float, nullable=True)
    created_by = Column(String(100), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (Index("ix_unified_records_normalized_name", "normalized_name"),)
