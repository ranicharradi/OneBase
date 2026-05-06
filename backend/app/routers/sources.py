"""Data source CRUD endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.dependencies import get_current_user, get_db, require_role
from app.models.enums import RecordStatus, UserRole
from app.models.staging import StagedRecord
from app.models.user import User
from app.schemas.source import (
    DataSourceCreate,
    DataSourceResponse,
    DataSourceUpdate,
)
from app.services.audit import log_action
from app.services.source import (
    create_source,
    delete_source,
    get_source,
    get_sources,
    update_source,
)

UPLOAD_DIR = settings.upload_dir

router = APIRouter(prefix="/api/sources", tags=["sources"])


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
