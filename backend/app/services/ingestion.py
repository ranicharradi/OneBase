"""Ingestion orchestration service.

Processes uploaded CSV files through the full pipeline:
parse → map → diff → apply → normalize → embed → finalize

Records are written into `StagedRecord.fields` (JSONB) keyed by FieldDef.key.
The NAME-role field's value is also written to the universal `name` column
(truncated to 255 chars if needed) so the matcher's HNSW/text indexes work.

Re-uploads are handled as a three-way diff keyed by DataSource.identity_field_key:
  - insert: new key not previously seen
  - update: same key, different fields
  - retire: key present before but absent in the re-upload
  - unchanged: same key and identical fields (record kept as-is)

Pass force_replace=True to revert to the old "supersede all + insert" behavior.
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.models.batch import ImportBatch
from app.models.enums import BatchStatus, RecordStatus
from app.models.source import DataSource
from app.models.staging import StagedRecord
from app.record_types import get as get_record_type
from app.services.embedding import compute_embeddings
from app.services.normalization import normalize_name
from app.utils.tabular_parser import parse_file
from app.utils.values import normalize_value

logger = logging.getLogger(__name__)

_NAME_MAX_LEN = 255  # matches StagedRecord.name column


@dataclass(frozen=True)
class DiffPlan:
    """Result of comparing a prior source snapshot against an incoming re-upload.

    Keys are values of the source's identity_field_key column.
    """

    inserts: dict[str, dict] = field(default_factory=dict)
    updates: dict[str, dict] = field(default_factory=dict)
    retires: set[str] = field(default_factory=set)
    unchanged: set[str] = field(default_factory=set)


def diff_snapshot(
    *,
    prior_by_key: dict[str, dict],
    incoming_by_key: dict[str, dict],
) -> DiffPlan:
    """Pure three-way diff. No DB access; caller is responsible for applying the plan."""
    inserts: dict[str, dict] = {}
    updates: dict[str, dict] = {}
    unchanged: set[str] = set()
    for key, fields_in in incoming_by_key.items():
        if key not in prior_by_key:
            inserts[key] = fields_in
        elif prior_by_key[key] == fields_in:
            unchanged.add(key)
        else:
            updates[key] = fields_in
    retires = set(prior_by_key.keys()) - set(incoming_by_key.keys())
    return DiffPlan(inserts=inserts, updates=updates, retires=retires, unchanged=unchanged)


def _clean_ingested_value(value: object) -> str | None:
    cleaned = normalize_value(value)
    return str(cleaned) if cleaned is not None else None


def _map_row(
    row: dict,
    column_mapping: dict[str, str],
    valid_field_keys: set[str],
    field_defs_by_key: dict,
    *,
    identity_field_key: str | None = None,
) -> dict[str, str]:
    """Map a raw CSV row to a fields dict keyed by FieldDef.key.

    Keys not in valid_field_keys are silently skipped, EXCEPT the identity_field_key
    which is always included when present in column_mapping (it may be a business code
    not declared as a RecordType field).
    """
    fields: dict[str, str] = {}
    for field_key, csv_col in column_mapping.items():
        if field_key not in valid_field_keys and field_key != identity_field_key:
            continue  # silently ignore stale mappings (identity key is always kept)
        value = _clean_ingested_value(row.get(csv_col))
        if value is None:
            continue
        fd = field_defs_by_key.get(field_key)
        if fd is not None and fd.normalize == "identifier":
            value = "".join(str(value).split()).upper()
        fields[field_key] = value
    return fields


def run_ingestion(
    db: Session,
    batch_id: int,
    file_content: bytes,
    progress_callback: Callable | None = None,
    *,
    force_replace: bool = False,
) -> int:
    """Run the full ingestion pipeline for an uploaded CSV file.

    By default uses a three-way diff keyed by source.identity_field_key so that
    re-uploads insert/update/retire records surgically.  Pass force_replace=True
    to revert to the legacy "supersede all + insert all" behavior.
    """
    batch = db.query(ImportBatch).filter(ImportBatch.id == batch_id).one()
    source = db.query(DataSource).filter(DataSource.id == batch.data_source_id).one()
    rt = get_record_type(source.type)
    column_mapping: dict[str, str] = source.column_mapping or {}
    valid_field_keys = set(rt.field_keys)
    identity_field_key: str = source.identity_field_key

    # Defensive: identity key must be in column_mapping so we can extract it.
    # (Pydantic on the router side guarantees this, but fail loudly if misconfigured.)
    if identity_field_key not in column_mapping:
        raise ValueError(
            f"DataSource {source.id!r}: identity_field_key {identity_field_key!r} "
            f"is not present in column_mapping — cannot diff on re-upload."
        )

    name_field_key = rt.name_field.key
    field_defs_by_key = {f.key: f for f in rt.fields}

    try:
        # 1. PARSE
        if progress_callback:
            progress_callback("parsing", 0)

        rows = parse_file(file_content, batch.filename, delimiter=source.delimiter)

        if not rows:
            batch.row_count = 0
            batch.status = BatchStatus.COMPLETED
            batch.ingest_stats = {
                "inserted": 0,
                "updated": 0,
                "retired": 0,
                "unchanged": 0,
                "force_replace": force_replace,
            }
            if progress_callback:
                progress_callback("complete", 100)
            return 0

        # 2. BUILD incoming maps (last-wins on duplicate identity key)
        incoming_by_key: dict[str, dict] = {}
        incoming_raw_by_key: dict[str, dict] = {}
        for row in rows:
            mapped = _map_row(
                row,
                column_mapping,
                valid_field_keys,
                field_defs_by_key,
                identity_field_key=identity_field_key,
            )
            id_val = mapped.get(identity_field_key)
            if not id_val:
                continue  # skip rows with no identity value
            incoming_by_key[id_val] = mapped
            incoming_raw_by_key[id_val] = dict(row)

        # 3. LOAD prior records (ACTIVE + RETIRED) and build lookup maps
        prior_records = (
            db.query(StagedRecord)
            .filter(
                StagedRecord.data_source_id == source.id,
                StagedRecord.status.in_([RecordStatus.ACTIVE, RecordStatus.RETIRED]),
            )
            .all()
        )
        prior_by_key: dict[str, dict] = {}
        prior_record_by_key: dict[str, StagedRecord] = {}
        for rec in prior_records:
            id_val = (rec.fields or {}).get(identity_field_key)
            if not id_val:
                continue
            prior_by_key[id_val] = rec.fields
            prior_record_by_key[id_val] = rec

        # 4. COMPUTE DIFF PLAN
        if force_replace:
            # Legacy behavior: supersede everything and insert all incoming rows.
            superseded_ids = [r.id for r in prior_records]
            if superseded_ids:
                db.query(StagedRecord).filter(StagedRecord.id.in_(superseded_ids)).update(
                    {"status": RecordStatus.SUPERSEDED}, synchronize_session="fetch"
                )
            plan = DiffPlan(
                inserts=dict(incoming_by_key),
                updates={},
                retires=set(),
                unchanged=set(),
            )
        else:
            plan = diff_snapshot(prior_by_key=prior_by_key, incoming_by_key=incoming_by_key)

        if progress_callback:
            progress_callback("normalizing", 33)

        # 5. APPLY PLAN
        # Queue holds (StagedRecord, name_str) for records that need (re-)embedding.
        embed_queue: list[tuple[StagedRecord, str]] = []

        # 5a. INSERTS — create new records
        for id_val, mapped in plan.inserts.items():
            name_value = mapped.get(name_field_key)
            if name_value and len(name_value) > _NAME_MAX_LEN:
                name_value = name_value[:_NAME_MAX_LEN]
            rec = StagedRecord(
                import_batch_id=batch.id,
                data_source_id=source.id,
                type=source.type,
                name=name_value,
                fields=mapped,
                raw_data=incoming_raw_by_key[id_val],
                status=RecordStatus.ACTIVE,
            )
            db.add(rec)
            embed_queue.append((rec, name_value or ""))

        # 5b. UPDATES — mutate existing records in-place
        for id_val, mapped in plan.updates.items():
            rec = prior_record_by_key[id_val]
            old_name = rec.name
            name_value = mapped.get(name_field_key)
            if name_value and len(name_value) > _NAME_MAX_LEN:
                name_value = name_value[:_NAME_MAX_LEN]
            rec.fields = mapped
            rec.raw_data = incoming_raw_by_key[id_val]
            rec.import_batch_id = batch.id
            rec.status = RecordStatus.ACTIVE  # handles RETIRED → ACTIVE on edit
            rec.name = name_value
            if name_value != old_name:
                embed_queue.append((rec, name_value or ""))

        # 5c. RETIRES — mark missing records as RETIRED
        for id_val in plan.retires:
            prior_record_by_key[id_val].status = RecordStatus.RETIRED

        # 5d. UNCHANGED — if a record was RETIRED and is now back with identical fields,
        #     flip it to ACTIVE and refresh the batch link.
        for id_val in plan.unchanged:
            rec = prior_record_by_key[id_val]
            if rec.status == RecordStatus.RETIRED:
                rec.status = RecordStatus.ACTIVE
                rec.import_batch_id = batch.id

        db.flush()

        if progress_callback:
            progress_callback("normalizing", 50)

        # 6. NORMALIZE + EMBED only the records that need it
        if progress_callback:
            progress_callback("embedding", 66)

        if embed_queue:
            for rec, _name in embed_queue:
                rec.normalized_name = normalize_name(rec.name)
            db.flush()

            names_to_embed = [name for _, name in embed_queue]
            embeddings = compute_embeddings(names_to_embed)
            for i, (rec, _) in enumerate(embed_queue):
                rec.name_embedding = embeddings[i].tolist()
            db.flush()

        # 7. FINALIZE
        batch.row_count = len(rows)
        batch.status = BatchStatus.COMPLETED
        batch.ingest_stats = {
            "inserted": len(plan.inserts),
            "updated": len(plan.updates),
            "retired": len(plan.retires),
            "unchanged": len(plan.unchanged),
            "force_replace": force_replace,
        }
        db.flush()

        if progress_callback:
            progress_callback("complete", 100)

        return len(rows)

    except Exception as e:
        batch.status = BatchStatus.FAILED
        batch.error_message = str(e)
        db.flush()
        raise
