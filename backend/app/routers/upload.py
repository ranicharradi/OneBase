"""File upload and batch management endpoints."""

import os
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.models.batch import ImportBatch
from app.models.enums import BatchStatus
from app.models.source import DataSource
from app.models.user import User
from app.schemas.upload import BatchResponse, TaskStatusResponse, UploadResponse
from app.services.audit import log_action
from app.tasks.celery_app import celery_app
from app.tasks.ingestion import process_upload

router = APIRouter(prefix="/api/import", tags=["import"])

# Ensure upload directory exists
UPLOAD_DIR = os.path.join("data", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50 MB


@router.post("/upload", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile | None = File(None),
    file_ref: str | None = Form(None),
    data_source_id: int = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a CSV file for processing.

    Accepts either a file upload or a file_ref from a prior match-source call.
    Creates an ImportBatch and dispatches a Celery task to process the file.
    """
    if file_ref and file is None:
        # Load from previously saved file
        filepath = os.path.join(UPLOAD_DIR, file_ref)
        if not os.path.isfile(filepath):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="file_ref not found. Please re-upload the file.",
            )
        stored_filename = file_ref
        original_filename = file_ref.split("_", 1)[1] if "_" in file_ref else file_ref
    elif file is not None:
        # Validate file extension
        if not file.filename or not file.filename.lower().endswith(".csv"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only .csv files are accepted",
            )

        # Validate data source exists
        source = db.query(DataSource).filter(DataSource.id == data_source_id).first()
        if source is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Data source not found",
            )

        # Save file to disk
        file_content = await file.read()

        # Validate file size
        if len(file_content) > MAX_UPLOAD_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"File exceeds maximum size of {MAX_UPLOAD_SIZE // (1024 * 1024)} MB",
            )

        # Validate UTF-8 encoding
        try:
            file_content.decode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File is not valid UTF-8. Please re-save as UTF-8 and try again.",
            ) from None
        stored_filename = f"{uuid.uuid4()}_{file.filename}"
        filepath = os.path.join(UPLOAD_DIR, stored_filename)
        with open(filepath, "wb") as f:
            f.write(file_content)
        original_filename = file.filename
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either file or file_ref must be provided",
        )

    # Validate data source exists (for file_ref path too)
    source = db.query(DataSource).filter(DataSource.id == data_source_id).first()
    if source is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Data source not found",
        )

    # Block re-upload while a batch is still processing for this source
    active_batch = (
        db.query(ImportBatch)
        .filter(
            ImportBatch.data_source_id == data_source_id,
            ImportBatch.status.in_([BatchStatus.PENDING, BatchStatus.PROCESSING]),
        )
        .first()
    )
    if active_batch:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Source already has an in-progress upload (batch {active_batch.id}). "
            f"Wait for it to complete before re-uploading.",
        )

    # Create import batch
    batch = ImportBatch(
        data_source_id=data_source_id,
        filename=stored_filename,
        uploaded_by=current_user.username,
        status=BatchStatus.PENDING,
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
        details={"filename": original_filename, "data_source_id": data_source_id},
    )
    db.commit()

    return UploadResponse(
        batch_id=batch.id,
        task_id=task.id,
        filename=original_filename or stored_filename,
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


@router.delete("/batches/{batch_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a stuck or unwanted import batch.

    Only batches with status 'pending' or 'failed' can be deleted.
    """
    batch = db.query(ImportBatch).filter(ImportBatch.id == batch_id).first()
    if batch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found")
    if batch.status not in (BatchStatus.PENDING, BatchStatus.FAILED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete batch with status '{batch.status}'. Only pending or failed batches can be deleted.",
        )
    # Clean up file from disk
    if batch.filename:
        file_full_path = os.path.join(UPLOAD_DIR, batch.filename)
        if os.path.exists(file_full_path):
            os.unlink(file_full_path)

    db.delete(batch)
    log_action(
        db,
        user_id=current_user.id,
        action="delete_batch",
        entity_type="import_batch",
        entity_id=batch_id,
    )
    db.commit()


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
