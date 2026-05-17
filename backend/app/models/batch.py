from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from app.models.base import Base, json_type
from app.models.enums import BatchStatus


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id = Column(Integer, primary_key=True, autoincrement=True)
    data_source_id = Column(Integer, ForeignKey("data_sources.id"), nullable=False)
    filename = Column(String(255), nullable=False)  # storage key: "<uuid>_<original>"
    original_filename = Column(String(255), nullable=False)  # user's original name
    file_extension = Column(String(16), nullable=False)  # ".csv" / ".xlsx"
    uploaded_by = Column(String(100), nullable=False)
    row_count = Column(Integer, nullable=True)
    status = Column(String(20), default=BatchStatus.PENDING)  # pending/processing/completed/failed
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    task_id = Column(String(255), nullable=True)  # Celery task ID
    ingest_stats = Column(
        json_type(), nullable=True
    )  # {"inserted": N, "updated": M, "retired": K, "force_replace": bool}

    data_source = relationship("DataSource")
