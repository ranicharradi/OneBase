from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Table, Text, func
from sqlalchemy.orm import relationship

from app.models.base import Base, json_type

match_run_sources = Table(
    "match_run_sources",
    Base.metadata,
    Column("match_run_id", Integer, ForeignKey("match_runs.id", ondelete="CASCADE"), primary_key=True),
    Column("data_source_id", Integer, ForeignKey("data_sources.id", ondelete="CASCADE"), primary_key=True),
)


class MatchRun(Base):
    """A user-initiated match job over the current state of one or two sources."""

    __tablename__ = "match_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    type = Column(String(50), nullable=False)
    mode = Column(String(20), nullable=False)  # FILE_VS_FILE | FILE_VS_GOLDEN
    status = Column(String(20), nullable=False, default="pending")
    name = Column(String(255), nullable=True)
    created_by = Column(String(100), nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    task_id = Column(String(255), nullable=True)
    stats = Column(json_type(), nullable=False, default=dict)
    error_message = Column(Text, nullable=True)

    sources = relationship(
        "DataSource",
        secondary=match_run_sources,
        backref="match_runs",
    )
