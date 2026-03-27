from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from app.models.base import Base


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id = Column(Integer, primary_key=True, autoincrement=True)
    data_source_id = Column(Integer, ForeignKey("data_sources.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    uploaded_by = Column(String(100), nullable=False)
    row_count = Column(Integer, nullable=True)
    status = Column(String(20), default="pending")  # pending/processing/completed/failed
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    task_id = Column(String(255), nullable=True)  # Celery task ID
    matching_task_id = Column(String(255), nullable=True)  # Matching Celery task ID

    data_source = relationship("DataSource")
