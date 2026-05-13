"""Ingestion orchestration service.

Processes uploaded CSV files through the full pipeline:
parse → map → supersede → store → normalize → embed → finalize

Records are written into `StagedRecord.fields` (JSONB) keyed by FieldDef.key.
The NAME-role field's value is also written to the universal `name` column
(truncated to 255 chars if needed) so the matcher's HNSW/text indexes work.
"""

import logging
from collections.abc import Callable

from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.models.batch import ImportBatch
from app.models.enums import BatchStatus, CandidateStatus, RecordStatus
from app.models.match import MatchCandidate
from app.models.source import DataSource
from app.models.staging import StagedRecord
from app.record_types import get as get_record_type
from app.services.embedding import compute_embeddings
from app.services.normalization import normalize_name
from app.utils.tabular_parser import parse_csv

logger = logging.getLogger(__name__)

_NAME_MAX_LEN = 255  # matches StagedRecord.name column


def _clean(value: str | None) -> str | None:
    """Strip whitespace and treat empty as None."""
    if value is None:
        return None
    s = str(value).strip()
    return s if s else None


def run_ingestion(
    db: Session,
    batch_id: int,
    file_content: bytes,
    progress_callback: Callable | None = None,
) -> int:
    """Run the full ingestion pipeline for an uploaded CSV file."""
    batch = db.query(ImportBatch).filter(ImportBatch.id == batch_id).one()
    source = db.query(DataSource).filter(DataSource.id == batch.data_source_id).one()
    rt = get_record_type(source.type)
    column_mapping: dict[str, str] = source.column_mapping or {}
    valid_field_keys = set(rt.field_keys)

    try:
        # 1. PARSE
        if progress_callback:
            progress_callback("parsing", 0)

        rows = parse_csv(file_content, delimiter=source.delimiter)

        if not rows:
            batch.row_count = 0
            batch.status = BatchStatus.COMPLETED
            if progress_callback:
                progress_callback("complete", 100)
            return 0

        # 2. SUPERSEDE old records of the same source
        try:
            existing_active = (
                db.query(StagedRecord)
                .filter(
                    StagedRecord.data_source_id == source.id,
                    StagedRecord.status == RecordStatus.ACTIVE,
                )
                .with_for_update(nowait=True)
                .all()
            )
        except OperationalError:
            db.rollback()
            # SQLite doesn't support FOR UPDATE — fall back to unlocked query.
            # On PostgreSQL, nowait=True raises OperationalError when rows are
            # locked by a concurrent transaction — re-raise to signal conflict.
            if "sqlite" not in str(db.bind.url):
                raise
            existing_active = (
                db.query(StagedRecord)
                .filter(
                    StagedRecord.data_source_id == source.id,
                    StagedRecord.status == RecordStatus.ACTIVE,
                )
                .all()
            )

        if existing_active:
            superseded_ids = [r.id for r in existing_active]
            db.query(StagedRecord).filter(StagedRecord.id.in_(superseded_ids)).update(
                {"status": RecordStatus.SUPERSEDED}, synchronize_session="fetch"
            )
            if superseded_ids:
                db.query(MatchCandidate).filter(
                    MatchCandidate.status == CandidateStatus.PENDING,
                    (MatchCandidate.record_a_id.in_(superseded_ids) | MatchCandidate.record_b_id.in_(superseded_ids)),
                ).update({"status": CandidateStatus.INVALIDATED}, synchronize_session="fetch")

        # 3. MAP and STORE
        name_field_key = rt.name_field.key
        records: list[StagedRecord] = []
        for row in rows:
            fields: dict[str, str] = {}
            for field_key, csv_col in column_mapping.items():
                if field_key not in valid_field_keys:
                    continue  # silently ignore stale mappings
                value = _clean(row.get(csv_col))
                if value is not None:
                    fields[field_key] = value

            name_value = fields.get(name_field_key)
            if name_value and len(name_value) > _NAME_MAX_LEN:
                name_value = name_value[:_NAME_MAX_LEN]

            record = StagedRecord(
                import_batch_id=batch.id,
                data_source_id=source.id,
                type=source.type,
                name=name_value,
                fields=fields,
                raw_data=dict(row),
                status=RecordStatus.ACTIVE,
            )
            records.append(record)

        db.add_all(records)
        db.flush()

        if progress_callback:
            progress_callback("normalizing", 33)

        # 4. NORMALIZE names
        for record in records:
            record.normalized_name = normalize_name(record.name)
        db.flush()

        if progress_callback:
            progress_callback("normalizing", 50)

        # 5. EMBED
        if progress_callback:
            progress_callback("embedding", 66)

        normalized_names = [r.normalized_name or "" for r in records]
        embeddings = compute_embeddings(normalized_names)

        for i, record in enumerate(records):
            record.name_embedding = embeddings[i].tolist()

        db.flush()

        # 6. FINALIZE
        batch.row_count = len(rows)
        batch.status = BatchStatus.COMPLETED
        db.flush()

        if progress_callback:
            progress_callback("complete", 100)

        return len(rows)

    except Exception as e:
        batch.status = BatchStatus.FAILED
        batch.error_message = str(e)
        db.flush()
        raise
