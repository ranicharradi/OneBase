"""Shared record + source enrichment lookup."""

from sqlalchemy.orm import Session

from app.models.source import DataSource
from app.models.staging import StagedRecord


def load_enriched_records(db: Session, record_ids: list[int]) -> dict[int, dict]:
    """Fetch staged records joined with their data source name.

    Returns {record_id: {id, type, name, fields, data_source_id, source_name}}.
    Single JOIN query; missing ids are simply absent from the result.
    """
    if not record_ids:
        return {}
    rows = (
        db.query(
            StagedRecord.id,
            StagedRecord.type,
            StagedRecord.name,
            StagedRecord.fields,
            StagedRecord.data_source_id,
            DataSource.name.label("source_name"),
        )
        .join(DataSource, StagedRecord.data_source_id == DataSource.id)
        .filter(StagedRecord.id.in_(record_ids))
        .all()
    )
    return {
        r.id: {
            "id": r.id,
            "type": r.type,
            "name": r.name,
            "fields": r.fields or {},
            "data_source_id": r.data_source_id,
            "source_name": r.source_name,
        }
        for r in rows
    }
