from sqlalchemy import (
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

from app.models.base import Base, json_type
from app.models.enums import CandidateStatus


class MatchGroup(Base):
    __tablename__ = "match_groups"

    id = Column(Integer, primary_key=True, autoincrement=True)
    type = Column(String(50), nullable=False)
    match_run_id = Column(Integer, ForeignKey("match_runs.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(20), default="open")
    created_at = Column(DateTime, server_default=func.now())

    candidates = relationship("MatchCandidate", back_populates="group")


class MatchCandidate(Base):
    __tablename__ = "match_candidates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    type = Column(String(50), nullable=False)
    match_run_id = Column(Integer, ForeignKey("match_runs.id", ondelete="CASCADE"), nullable=False)
    record_a_id = Column(Integer, nullable=False)
    record_b_id = Column(Integer, nullable=False)
    side_a_kind = Column(String(10), nullable=False, default="staged")
    side_b_kind = Column(String(10), nullable=False, default="staged")
    confidence = Column(Float, nullable=False)
    match_signals = Column(json_type(), nullable=False)
    status = Column(String(20), default=CandidateStatus.PENDING)
    reviewed_by = Column(String(100), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    group_id = Column(Integer, ForeignKey("match_groups.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    group = relationship("MatchGroup", back_populates="candidates")

    __table_args__ = (
        UniqueConstraint(
            "match_run_id",
            "record_a_id",
            "record_b_id",
            "side_a_kind",
            "side_b_kind",
            name="uq_match_pair_per_run",
        ),
    )
