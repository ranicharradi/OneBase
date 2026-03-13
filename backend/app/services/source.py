"""Data source CRUD service."""
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.models.source import DataSource
from app.schemas.source import DataSourceCreate, DataSourceUpdate


def create_source(db: Session, data: DataSourceCreate) -> DataSource:
    """Create a new data source."""
    source = DataSource(
        name=data.name,
        description=data.description,
        file_format=data.file_format,
        delimiter=data.delimiter,
        column_mapping=data.column_mapping.model_dump(),
    )
    db.add(source)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise ValueError(f"Data source with name '{data.name}' already exists")
    return source


def get_sources(db: Session) -> list[DataSource]:
    """Get all data sources ordered by name."""
    return db.query(DataSource).order_by(DataSource.name).all()


def get_source(db: Session, source_id: int) -> DataSource | None:
    """Get a single data source by ID."""
    return db.query(DataSource).filter(DataSource.id == source_id).first()


def update_source(db: Session, source_id: int, data: DataSourceUpdate) -> DataSource | None:
    """Update a data source. Returns None if not found."""
    source = get_source(db, source_id)
    if source is None:
        return None

    if data.name is not None:
        source.name = data.name
    if data.description is not None:
        source.description = data.description
    if data.delimiter is not None:
        source.delimiter = data.delimiter
    if data.column_mapping is not None:
        source.column_mapping = data.column_mapping.model_dump()

    db.flush()
    return source


def delete_source(db: Session, source_id: int) -> bool:
    """Delete a data source. Returns True if deleted, False if not found."""
    source = get_source(db, source_id)
    if source is None:
        return False
    db.delete(source)
    db.flush()
    return True
