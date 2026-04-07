"""Data source CRUD service."""

import re

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.source import DataSource
from app.schemas.source import DataSourceCreate, DataSourceUpdate


def _validate_filename_pattern(pattern: str | None) -> None:
    """Validate a regex pattern. Raises ValueError if invalid."""
    if pattern is None:
        return
    try:
        re.compile(pattern)
    except re.error as e:
        raise ValueError(f"Invalid filename pattern: {e}") from e


def create_source(db: Session, data: DataSourceCreate) -> DataSource:
    """Create a new data source."""
    _validate_filename_pattern(data.filename_pattern)
    source = DataSource(
        name=data.name,
        description=data.description,
        file_format=data.file_format,
        delimiter=data.delimiter,
        column_mapping=data.column_mapping.model_dump(),
        filename_pattern=data.filename_pattern,
    )
    db.add(source)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise ValueError(f"Data source with name '{data.name}' already exists") from None
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
    if data.filename_pattern is not None:
        _validate_filename_pattern(data.filename_pattern)
        source.filename_pattern = data.filename_pattern

    db.flush()
    return source


def delete_source(db: Session, source_id: int) -> bool:
    """Delete a data source and all related data.

    Cascades through: MatchCandidates → StagedSuppliers → ImportBatches → DataSource.
    Returns True if deleted, False if not found.
    """
    from app.models.batch import ImportBatch
    from app.models.match import MatchCandidate
    from app.models.staging import StagedSupplier
    from app.models.unified import UnifiedSupplier

    source = get_source(db, source_id)
    if source is None:
        return False

    # Use subqueries for bulk deletes — keeps all work in the database
    # instead of loading thousands of IDs into Python memory.
    staged_subq = db.query(StagedSupplier.id).filter(StagedSupplier.data_source_id == source_id).subquery()
    candidate_subq = (
        db.query(MatchCandidate.id)
        .filter((MatchCandidate.supplier_a_id.in_(staged_subq)) | (MatchCandidate.supplier_b_id.in_(staged_subq)))
        .subquery()
    )

    # Nullify unified supplier references to match candidates being deleted
    db.query(UnifiedSupplier).filter(UnifiedSupplier.match_candidate_id.in_(candidate_subq)).update(
        {UnifiedSupplier.match_candidate_id: None},
        synchronize_session=False,
    )

    # Delete match candidates
    db.query(MatchCandidate).filter(MatchCandidate.id.in_(candidate_subq)).delete(synchronize_session=False)

    # Delete staged suppliers
    db.query(StagedSupplier).filter(StagedSupplier.data_source_id == source_id).delete(synchronize_session=False)

    # Delete import batches
    db.query(ImportBatch).filter(ImportBatch.data_source_id == source_id).delete(synchronize_session=False)

    # Delete the source itself
    db.delete(source)
    db.flush()
    return True
