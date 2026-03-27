"""Pydantic v2 schemas for file upload and batch management."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UploadResponse(BaseModel):
    """Response schema for file upload."""

    batch_id: int
    task_id: str
    filename: str
    message: str


class BatchResponse(BaseModel):
    """Response schema for import batch."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    data_source_id: int
    filename: str
    uploaded_by: str
    row_count: int | None
    status: str
    error_message: str | None
    created_at: datetime | None = None
    task_id: str | None


class TaskStatusResponse(BaseModel):
    """Response schema for Celery task status."""

    task_id: str
    state: str
    stage: str | None = None
    progress: int | None = None
    detail: str | None = None
    row_count: int | None = None
