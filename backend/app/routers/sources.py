"""Data source CRUD endpoints."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from app.dependencies import get_db, get_current_user
from app.models.user import User
from app.schemas.source import (
    DataSourceCreate,
    DataSourceUpdate,
    DataSourceResponse,
    ColumnDetectResponse,
)
from app.services.source import (
    create_source,
    get_sources,
    get_source,
    update_source,
    delete_source,
)
from app.services.audit import log_action
from app.utils.csv_parser import detect_columns

router = APIRouter(prefix="/api/sources", tags=["sources"])


@router.post("", response_model=DataSourceResponse, status_code=status.HTTP_201_CREATED)
def create_data_source(
    data: DataSourceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))


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
    current_user: User = Depends(get_current_user),
):
    """Update a data source."""
    source = update_source(db, source_id, data)
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
    current_user: User = Depends(get_current_user),
):
    """Delete a data source."""
    deleted = delete_source(db, source_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Data source not found")
    log_action(
        db,
        user_id=current_user.id,
        action="delete_source",
        entity_type="data_source",
        entity_id=source_id,
    )
    db.commit()


@router.post("/{source_id}/detect-columns", response_model=ColumnDetectResponse)
async def detect_source_columns(
    source_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Detect column headers from an uploaded CSV file."""
    source = get_source(db, source_id)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Data source not found")
    content = await file.read()
    columns = detect_columns(content, delimiter=source.delimiter)
    return ColumnDetectResponse(columns=columns)
