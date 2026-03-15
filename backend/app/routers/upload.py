"""File upload and batch management endpoints."""

import os
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.dependencies import get_db, get_current_user
from app.models.user import User
from app.models.batch import ImportBatch
from app.models.source import DataSource
from app.schemas.upload import UploadResponse, BatchResponse, TaskStatusResponse
from app.services.audit import log_action
from app.tasks.celery_app import celery_app
from app.tasks.ingestion import process_upload

router = APIRouter(prefix="/api/import", tags=["import"])

# Ensure upload directory exists
UPLOAD_DIR = os.path.join("data", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post(
    "/upload", response_model=UploadResponse, status_code=status.HTTP_201_CREATED
)
async def upload_file(
    file: UploadFile = File(...),
    data_source_id: int = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a CSV file for processing.

    Creates an ImportBatch and dispatches a Celery task to process the file.
    """
    # Validate data source exists
    source = db.query(DataSource).filter(DataSource.id == data_source_id).first()
    if source is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Data source not found",
        )

    # Save file to disk
    file_content = await file.read()
    stored_filename = f"{uuid.uuid4()}_{file.filename}"
    filepath = os.path.join(UPLOAD_DIR, stored_filename)
    with open(filepath, "wb") as f:
        f.write(file_content)

    # Create import batch
    batch = ImportBatch(
        data_source_id=data_source_id,
        filename=stored_filename,
        uploaded_by=current_user.username,
        status="pending",
    )
    db.add(batch)
    db.flush()

    # Dispatch Celery task
    task = process_upload.delay(batch.id)
    batch.task_id = task.id
    db.flush()

    # Audit trail
    log_action(
        db,
        user_id=current_user.id,
        action="upload",
        entity_type="import_batch",
        entity_id=batch.id,
        details={"filename": file.filename, "data_source_id": data_source_id},
    )
    db.commit()

    return UploadResponse(
        batch_id=batch.id,
        task_id=task.id,
        filename=file.filename,
        message="File uploaded successfully. Processing started.",
    )


@router.get("/batches", response_model=list[BatchResponse])
def list_batches(
    data_source_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List import batches, optionally filtered by data source."""
    query = db.query(ImportBatch)
    if data_source_id is not None:
        query = query.filter(ImportBatch.data_source_id == data_source_id)
    return query.order_by(ImportBatch.created_at.desc()).all()


@router.get("/batches/{task_id}/status", response_model=TaskStatusResponse)
def get_task_status(
    task_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Poll Celery task progress.

    If the ingestion task is complete and the batch has a matching_task_id,
    automatically switches to reporting matching task progress — so the
    frontend ProgressTracker sees the full pipeline through a single task_id.
    """
    result = celery_app.AsyncResult(task_id)
    info = result.info or {}

    # Handle different result states
    if isinstance(info, dict):
        stage = info.get("stage")
        progress = info.get("progress")
        detail = info.get("detail")
        row_count = info.get("row_count")
    else:
        stage = None
        progress = None
        detail = str(info) if info else None
        row_count = None

    state = result.state

    # If ingestion is COMPLETE, check if there's a matching task to report on
    if (
        state == "SUCCESS"
        or (state == "COMPLETE")
        or (isinstance(info, dict) and info.get("stage") == "MATCHING_ENQUEUED")
    ):
        # Look up the batch by ingestion task_id to find matching_task_id
        batch = db.query(ImportBatch).filter(ImportBatch.task_id == task_id).first()
        if batch and batch.matching_task_id:
            matching_result = celery_app.AsyncResult(batch.matching_task_id)
            matching_info = matching_result.info or {}

            if matching_result.state in ("PENDING", "STARTED", "RETRY"):
                # Matching is queued / just started
                return TaskStatusResponse(
                    task_id=task_id,
                    state=matching_result.state,
                    stage="MATCHING",
                    progress=0,
                    detail="Matching pipeline starting...",
                    row_count=row_count,
                )
            elif matching_result.state == "SUCCESS":
                # Matching complete
                m_info = matching_info if isinstance(matching_info, dict) else {}
                candidate_count = m_info.get("candidate_count", 0)
                group_count = m_info.get("group_count", 0)
                return TaskStatusResponse(
                    task_id=task_id,
                    state="COMPLETE",
                    stage="MATCHING",
                    progress=100,
                    detail=f"{candidate_count} candidate pairs in {group_count} groups",
                    row_count=row_count,
                )
            elif matching_result.state == "FAILURE":
                return TaskStatusResponse(
                    task_id=task_id,
                    state="FAILURE",
                    stage="MATCHING",
                    progress=None,
                    detail=str(matching_info) if matching_info else "Matching failed",
                    row_count=row_count,
                )
            else:
                # Matching is in progress — report matching stage/progress
                if isinstance(matching_info, dict):
                    return TaskStatusResponse(
                        task_id=task_id,
                        state=matching_result.state,
                        stage=matching_info.get("stage", "MATCHING"),
                        progress=matching_info.get("progress"),
                        detail=matching_info.get("detail"),
                        row_count=row_count,
                    )
                return TaskStatusResponse(
                    task_id=task_id,
                    state=matching_result.state,
                    stage="MATCHING",
                    progress=None,
                    detail=None,
                    row_count=row_count,
                )

    # Map Celery SUCCESS to our COMPLETE convention
    if state == "SUCCESS":
        state = "COMPLETE"

    return TaskStatusResponse(
        task_id=task_id,
        state=state,
        stage=stage,
        progress=progress,
        detail=detail,
        row_count=row_count,
    )
