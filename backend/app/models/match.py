from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from app.models.base import Base


class MatchGroup(Base):
    __tablename__ = "match_groups"

    id = Column(Integer, primary_key=True, autoincrement=True)
    created_at = Column(DateTime, server_default=func.now())

    candidates = relationship("MatchCandidate", back_populates="group")


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
    group_id = Column(Integer, ForeignKey("match_groups.id"), nullable=True)

    group = relationship("MatchGroup", back_populates="candidates")

    __table_args__ = (UniqueConstraint("supplier_a_id", "supplier_b_id", name="uq_match_pair"),)
