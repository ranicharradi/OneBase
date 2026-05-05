"""Data source CRUD endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.dependencies import get_current_user, get_db, require_role
from app.models.enums import SupplierStatus, UserRole
from app.models.staging import StagedSupplier
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
    """Create a new data source with column mapping."""
    try:
        source = create_source(db, data)
        log_action(
            db,
            user_id=current_user.id,
            action="create_source",
            entity_type="data_source",
            entity_id=source.id,
            details={"name": source.name},
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all data sources."""
    return get_sources(db)


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
    """Update a data source."""
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
        details={"name": source.name},
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
    """Delete a data source."""
    source = get_source(db, source_id)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Data source not found")
    source_name = source.name
    delete_source(db, source_id)
    log_action(
        db,
        user_id=current_user.id,
        action="delete_source",
        entity_type="data_source",
        entity_id=source_id,
        details={"name": source_name},
    )
    db.commit()


@router.get("/{source_id}/upload-stats")
def get_upload_stats(
    source_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get counts of active staged suppliers and pending match candidates for a source."""
    from app.models.enums import CandidateStatus
    from app.models.match import MatchCandidate

    source = get_source(db, source_id)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Data source not found")

    staged_count = (
        db.query(func.count(StagedSupplier.id))
        .filter(
            StagedSupplier.data_source_id == source_id,
            StagedSupplier.status == SupplierStatus.ACTIVE,
        )
        .scalar()
        or 0
    )

    source_supplier_ids = (
        db.query(StagedSupplier.id)
        .filter(
            StagedSupplier.data_source_id == source_id,
            StagedSupplier.status == SupplierStatus.ACTIVE,
        )
        .subquery()
    )
    pending_match_count = (
        db.query(func.count(MatchCandidate.id))
        .filter(
            MatchCandidate.status == CandidateStatus.PENDING,
            (MatchCandidate.supplier_a_id.in_(source_supplier_ids))
            | (MatchCandidate.supplier_b_id.in_(source_supplier_ids)),
        )
        .scalar()
        or 0
    )

    return {"staged_count": staged_count, "pending_match_count": pending_match_count}
