"""Data source create/list/read/delete service."""

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.source import DataSource
from app.record_types import get as get_record_type
from app.schemas.source import DataSourceCreate


def _validate_record_type(record_type_key: str) -> None:
    """Validate the type exists in the registry."""
    try:
        get_record_type(record_type_key)
    except KeyError as e:
        raise ValueError(f"Unknown record type: {record_type_key!r}") from e


def _validate_column_mapping(record_type_key: str, mapping: dict | None) -> None:
    """Validate that mapping keys are all FieldDef.keys and required fields are mapped.

    `mapping` is {field_key -> csv_column_name}.
    """
    rt = get_record_type(record_type_key)
    if not mapping:
        required = sorted(f.key for f in rt.fields if f.required)
        if required:
            raise ValueError(f"missing required field mappings for type {record_type_key!r}: {required}")
        return

    valid = set(rt.field_keys)
    bad = set(mapping.keys()) - valid
    if bad:
        raise ValueError(f"unknown field keys for type {record_type_key!r}: {sorted(bad)}")

    missing_required = sorted(f.key for f in rt.fields if f.required and not str(mapping.get(f.key, "")).strip())
    if missing_required:
        raise ValueError(f"missing required field mappings for type {record_type_key!r}: {missing_required}")


def create_source(db: Session, data: DataSourceCreate) -> DataSource:
    """Create a new data source."""
    _validate_record_type(data.type)
    _validate_column_mapping(data.type, data.column_mapping)
    source = DataSource(
        name=data.name,
        type=data.type,
        description=data.description,
        delimiter=data.delimiter,
        column_mapping=data.column_mapping,
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


def delete_source(db: Session, source_id: int) -> bool:
    """Delete a data source and all related data.

    Cascades through: MatchCandidates → StagedRecords → ImportBatches → DataSource.
    Returns True if deleted, False if not found.
    """
    from app.models.batch import ImportBatch
    from app.models.match import MatchCandidate
    from app.models.staging import StagedRecord

    source = get_source(db, source_id)
    if source is None:
        return False

    staged_subq = db.query(StagedRecord.id).filter(StagedRecord.data_source_id == source_id)
    candidate_subq = db.query(MatchCandidate.id).filter(
        (MatchCandidate.record_a_id.in_(staged_subq)) | (MatchCandidate.record_b_id.in_(staged_subq))
    )

    db.query(MatchCandidate).filter(MatchCandidate.id.in_(candidate_subq)).delete(synchronize_session=False)
    db.query(StagedRecord).filter(StagedRecord.data_source_id == source_id).delete(synchronize_session=False)
    db.query(ImportBatch).filter(ImportBatch.data_source_id == source_id).delete(synchronize_session=False)

    db.delete(source)
    db.flush()
    return True
