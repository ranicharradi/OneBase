from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Table, Text, func
from sqlalchemy.orm import relationship

from app.models.base import Base, json_type

match_run_batches = Table(
    "match_run_batches",
    Base.metadata,
    Column("match_run_id", Integer, ForeignKey("match_runs.id", ondelete="CASCADE"), primary_key=True),
    Column("import_batch_id", Integer, ForeignKey("import_batches.id", ondelete="CASCADE"), primary_key=True),
)


class MatchRun(Base):
    """A user-initiated match job over files/golden records of one type."""

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

    batches = relationship(
        "ImportBatch",
        secondary=match_run_batches,
        backref="match_runs",
    )
