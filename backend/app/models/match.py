from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey, JSON, UniqueConstraint, func

from app.models.base import Base


class MatchCandidate(Base):
    __tablename__ = "match_candidates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    supplier_a_id = Column(Integer, ForeignKey("staged_suppliers.id"), nullable=False)
    supplier_b_id = Column(Integer, ForeignKey("staged_suppliers.id"), nullable=False)
    confidence = Column(Float, nullable=False)
    match_signals = Column(JSON, nullable=False)
    status = Column(String(20), default="pending")  # pending/confirmed/rejected/skipped/invalidated
    reviewed_by = Column(String(100), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("supplier_a_id", "supplier_b_id", name="uq_match_pair"),
    )
