"""Data source CRUD endpoints."""

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.dependencies import get_current_user, get_db, require_role
from app.models.enums import RecordStatus, UserRole
from app.models.staging import StagedRecord
from app.models.user import User
from app.rate_limit import limiter
from app.schemas.source import (
    DataSourceCreate,
    DataSourceResponse,
    DataSourceUpdate,
    DetectHeadersResponse,
    SuggestMappingRequest,
    SuggestMappingResponse,
)
from app.services.audit import log_action
from app.services.source import (
    create_source,
    delete_source,
    get_source,
    get_sources,
    update_source,
)
from app.utils.tabular_parser import detect_headers

UPLOAD_DIR = settings.upload_dir

router = APIRouter(prefix="/api/sources", tags=["sources"])

MAX_DETECT_SIZE = 50 * 1024 * 1024  # 50 MB — match upload route


@router.post("", response_model=DataSourceResponse, status_code=status.HTTP_201_CREATED)
def create_data_source(
    data: DataSourceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Create a new data source with a record type and column mapping."""
    try:
        source = create_source(db, data)
        log_action(
            db,
            user_id=current_user.id,
            action="create_source",
            entity_type="data_source",
            entity_id=source.id,
            details={"name": source.name, "type": source.type},
        )
        db.commit()
        db.refresh(source)
        return source
    except ValueError as e:
        err_msg = str(e)
        if "already exists" in err_msg:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=err_msg) from e
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err_msg) from e


@router.get("", response_model=list[DataSourceResponse])
def list_data_sources(
    type: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all data sources, optionally filtered by record type."""
    sources = get_sources(db)
    if type is not None:
        sources = [s for s in sources if s.type == type]
    return sources


@router.get("/{source_id}", response_model=DataSourceResponse)
def get_data_source(
    source_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single data source by ID."""
    source = get_source(db, source_id)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Data source not found")
    return source


@router.put("/{source_id}", response_model=DataSourceResponse)
def update_data_source(
    source_id: int,
    data: DataSourceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Update a data source. The record type is locked at creation."""
    try:
        source = update_source(db, source_id, data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Data source not found")
    log_action(
        db,
        user_id=current_user.id,
        action="update_source",
        entity_type="data_source",
        entity_id=source.id,
        details={"name": source.name, "type": source.type},
    )
    db.commit()
    db.refresh(source)
    return source


@router.delete("/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_data_source(
    source_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Delete a data source and all related data."""
    source = get_source(db, source_id)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Data source not found")
    source_name = source.name
    source_type = source.type
    delete_source(db, source_id)
    log_action(
        db,
        user_id=current_user.id,
        action="delete_source",
        entity_type="data_source",
        entity_id=source_id,
        details={"name": source_name, "type": source_type},
    )
    db.commit()


@router.get("/{source_id}/upload-stats")
def get_upload_stats(
    source_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get counts of active staged records and pending match candidates for a source."""
    from app.models.enums import CandidateStatus
    from app.models.match import MatchCandidate

    source = get_source(db, source_id)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Data source not found")

    staged_count = (
        db.query(func.count(StagedRecord.id))
        .filter(
            StagedRecord.data_source_id == source_id,
            StagedRecord.status == RecordStatus.ACTIVE,
        )
        .scalar()
        or 0
    )

    source_record_ids = (
        db.query(StagedRecord.id)
        .filter(
            StagedRecord.data_source_id == source_id,
            StagedRecord.status == RecordStatus.ACTIVE,
        )
        .subquery()
    )
    pending_match_count = (
        db.query(func.count(MatchCandidate.id))
        .filter(
            MatchCandidate.status == CandidateStatus.PENDING,
            (MatchCandidate.record_a_id.in_(source_record_ids)) | (MatchCandidate.record_b_id.in_(source_record_ids)),
        )
        .scalar()
        or 0
    )

    return {"staged_count": staged_count, "pending_match_count": pending_match_count}


@router.post("/detect-headers", response_model=DetectHeadersResponse)
async def detect_source_headers(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Return column headers + detected delimiter + format for a CSV or XLSX file."""
    filename = file.filename or ""
    filename_lower = filename.lower()
    if not (filename_lower.endswith(".csv") or filename_lower.endswith(".xlsx")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .csv and .xlsx files are accepted",
        )

    file_content = await file.read()
    if len(file_content) > MAX_DETECT_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"File exceeds maximum size of {MAX_DETECT_SIZE // (1024 * 1024)} MB",
        )

    try:
        columns, delimiter = detect_headers(file_content, filename)
    except ValueError as exc:
        message = str(exc)
        if "Could not read Excel" in message:
            detail = "Could not read Excel file (corrupted or wrong format)"
        else:
            detail = "Only .csv and .xlsx files are accepted"
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail) from exc

    file_format = "xlsx" if filename_lower.endswith(".xlsx") else "csv"
    return DetectHeadersResponse(columns=columns, delimiter=delimiter, format=file_format)


@router.post("/suggest-mapping", response_model=SuggestMappingResponse)
@limiter.limit("5/minute")
def suggest_mapping(
    request: Request,
    payload: SuggestMappingRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return AI-suggested header → field_key mapping for the given record type."""
    import time

    from pydantic import BaseModel

    from app.record_types import get as get_record_type
    from app.services import llm as llm_service

    try:
        rt = get_record_type(payload.record_type)
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"unknown record type {payload.record_type!r}") from exc

    # Cap inputs (cost guardrail)
    headers = payload.headers[:50]
    samples = payload.sample_rows[:3]

    field_lines = "\n".join(
        f"- {f.key}: {f.label} (role: {f.role.value}, synonyms: {list(f.synonyms)})" for f in rt.fields
    )
    prompt = (
        "Map each source column header to one of the canonical fields below, "
        "or null if no field fits. Return JSON with a single 'mapping' key.\n\n"
        f"Canonical fields:\n{field_lines}\n\n"
        f"Headers: {headers}\n"
        f"Sample rows: {samples}\n"
    )

    class _Sug(BaseModel):
        mapping: dict[str, str | None]

    t0 = time.perf_counter()
    result = llm_service.call_or_raise_http(lambda: llm_service.complete_structured(prompt, _Sug))
    latency_ms = int((time.perf_counter() - t0) * 1000)

    # Pass through LLM suggestions as-is; the caller resolves synonyms to canonical keys.
    cleaned = dict(result.mapping)

    log_action(
        db,
        user_id=current_user.id,
        action="llm_call",
        entity_type="record_type",
        entity_id=None,
        details={
            "feature": "suggest_mapping",
            "record_type": payload.record_type,
            "model": settings.llm_model,
            "latency_ms": latency_ms,
        },
    )
    db.commit()

    return SuggestMappingResponse(suggestions=cleaned, model=settings.llm_model, latency_ms=latency_ms)
