"""File upload and batch management endpoints."""

import os
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.dependencies import get_current_user, get_db, require_role
from app.models.batch import ImportBatch
from app.models.enums import BatchStatus, UserRole
from app.models.match_run import MatchRun, match_run_batches
from app.models.source import DataSource
from app.models.user import User
from app.schemas.upload import BatchResponse, TaskStatusResponse, UploadResponse
from app.services.audit import log_action
from app.services.ingestion import compute_diff_for_source
from app.services.normalization import normalize_name
from app.services.source_overlap import probe_overlap
from app.tasks.celery_app import celery_app
from app.tasks.ingestion import process_upload
from app.utils.file_format import extension_of, is_allowed_upload
from app.utils.paths import safe_upload_path
from app.utils.tabular_parser import parse_file
from app.utils.uploads import read_limited_upload

router = APIRouter(prefix="/api/import", tags=["import"])

# Ensure upload directory exists
UPLOAD_DIR = settings.upload_dir
os.makedirs(UPLOAD_DIR, exist_ok=True)

MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50 MB


@router.post("/preview", dependencies=[Depends(get_current_user)])
async def preview_diff(
    file: UploadFile = File(...),
    data_source_id: int = Form(...),
    db: Session = Depends(get_db),
):
    """Pre-flight diff: returns {inserted, updated, retired, unchanged} for an incoming re-upload."""
    source = db.query(DataSource).filter(DataSource.id == data_source_id).first()
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source not found")

    if not is_allowed_upload(file.filename or ""):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .csv and .xlsx files are accepted",
        )

    content = await read_limited_upload(file, MAX_UPLOAD_SIZE)
    rows = parse_file(content, file.filename or "", delimiter=source.delimiter)

    # lock=False: preview is read-only and must not block concurrent uploads
    plan, *_ = compute_diff_for_source(db, source=source, rows=rows, lock=False)
    return {
        "inserted": len(plan.inserts),
        "updated": len(plan.updates),
        "retired": len(plan.retires),
        "unchanged": len(plan.unchanged),
    }


@router.post("/upload", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile | None = File(None),
    file_ref: str | None = Form(None),
    data_source_id: int = Form(...),
    force_replace: bool = Form(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Upload a CSV file for processing.

    Accepts either a file upload or a file_ref from a prior match-source call.
    Creates an ImportBatch and dispatches a Celery task to process the file.
    """
    if file_ref and file is None:
        # Load from previously saved file
        try:
            filepath = safe_upload_path(UPLOAD_DIR, file_ref)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid file reference",
            ) from None
        if not os.path.isfile(filepath):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="file_ref not found. Please re-upload the file.",
            )
        stored_filename = file_ref
        original_filename = file_ref.split("_", 1)[1] if "_" in file_ref else file_ref
    elif file is not None:
        # Validate file extension via centralized allow-list
        if not is_allowed_upload(file.filename or ""):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only .csv and .xlsx files are accepted",
            )
        is_xlsx = extension_of(file.filename or "") == ".xlsx"

        # Validate data source exists
        source = db.query(DataSource).filter(DataSource.id == data_source_id).first()
        if source is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Source not found",
            )

        # Read with a hard cap before writing to disk.
        file_content = await read_limited_upload(file, MAX_UPLOAD_SIZE)

        # Validate UTF-8 encoding (CSV only — xlsx is a binary zip container)
        if not is_xlsx:
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
            detail="Source not found",
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
            detail=f"Source already has an in-progress upload (File #{active_batch.id}). "
            f"Wait for it to complete before re-uploading.",
        )

    # Create import batch and commit before dispatching Celery task,
    # so the worker's separate DB session can find the batch row.
    file_extension = os.path.splitext(original_filename)[1].lower() if original_filename else ""

    batch = ImportBatch(
        data_source_id=data_source_id,
        filename=stored_filename,
        original_filename=original_filename or stored_filename,
        file_extension=file_extension,
        uploaded_by=current_user.username,
        status=BatchStatus.PENDING,
    )
    db.add(batch)
    log_action(
        db,
        user_id=current_user.id,
        action="upload",
        entity_type="import_batch",
        entity_id=batch.id,
        details={
            "filename": original_filename,
            "data_source_id": data_source_id,
            "type": source.type,
        },
    )
    db.commit()

    # Dispatch Celery task — batch is now visible to the worker
    task = process_upload.delay(batch.id, force_replace=force_replace)
    batch.task_id = task.id
    db.commit()

    return UploadResponse(
        batch_id=batch.id,
        task_id=task.id,
        filename=original_filename or stored_filename,
        message="File uploaded successfully. Processing started.",
    )


@router.get("/batches", response_model=list[BatchResponse], dependencies=[Depends(get_current_user)])
def list_batches(
    data_source_id: int | None = None,
    type: str | None = None,
    db: Session = Depends(get_db),
):
    """List import batches, optionally filtered by data source or record type."""
    # Subquery: latest finished_at among completed runs per batch
    last_compared_subq = (
        db.query(
            match_run_batches.c.import_batch_id.label("batch_id"),
            func.max(MatchRun.finished_at).label("last_compared_at"),
        )
        .join(MatchRun, MatchRun.id == match_run_batches.c.match_run_id)
        .filter(MatchRun.status == "completed")
        .group_by(match_run_batches.c.import_batch_id)
        .subquery()
    )

    query = (
        db.query(ImportBatch, last_compared_subq.c.last_compared_at)
        .join(DataSource, ImportBatch.data_source_id == DataSource.id)
        .outerjoin(last_compared_subq, ImportBatch.id == last_compared_subq.c.batch_id)
    )
    if data_source_id is not None:
        query = query.filter(ImportBatch.data_source_id == data_source_id)
    if type is not None:
        query = query.filter(DataSource.type == type)
    rows = query.order_by(ImportBatch.created_at.desc()).all()
    return [
        BatchResponse(
            id=b.id,
            data_source_id=b.data_source_id,
            data_source_name=b.data_source.name,
            type=b.data_source.type,
            original_filename=b.original_filename,
            file_extension=b.file_extension,
            uploaded_by=b.uploaded_by,
            row_count=b.row_count,
            status=b.status,
            error_message=b.error_message,
            created_at=b.created_at,
            task_id=b.task_id,
            unified=lc is not None,
            last_compared_at=lc,
            ingest_stats=b.ingest_stats,
        )
        for b, lc in rows
    ]


@router.delete("/batches/{batch_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
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
        try:
            file_full_path = safe_upload_path(UPLOAD_DIR, batch.filename)
        except ValueError:
            file_full_path = None
        if file_full_path and os.path.exists(file_full_path):
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


@router.post("/overlap-probe")
async def overlap_probe(
    file: UploadFile = File(...),
    type: str = Form(...),
    name_column: str = Form(...),
    delimiter: str = Form(";"),
    threshold: float = Form(0.5),
    min_rows: int = Form(20),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Check how much an incoming file overlaps with existing sources of the same type.

    Returns a ranked list of existing sources ordered by descending overlap ratio.
    Use this pre-upload to detect likely duplicate sources before committing an import.
    """
    content = await file.read()
    rows = parse_file(content, file.filename or "", delimiter=delimiter)
    names = [normalize_name(row.get(name_column, "")) for row in rows]
    matches = probe_overlap(
        db,
        type_key=type,
        incoming_normalized_names=names,
        threshold=threshold,
        min_rows=min_rows,
    )
    return {
        "matches": [
            {
                "source_id": m.source_id,
                "source_name": m.source_name,
                "overlap_ratio": m.overlap_ratio,
                "matched_count": m.matched_count,
                "total_count": m.total_count,
            }
            for m in matches
        ],
    }


@router.get("/batches/{task_id}/status", response_model=TaskStatusResponse, dependencies=[Depends(get_current_user)])
def get_task_status(
    task_id: str,
):
    """Poll Celery task progress."""
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
