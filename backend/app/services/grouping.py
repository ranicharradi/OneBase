"""Intra-source grouping service — collapses exact-name duplicates within each data source.

Groups StagedRecord rows that share the same (data_source_id, normalized_name).
Picks the richest row (most populated FieldDef-keyed values) as the group representative.
Sets intra_source_group_id on all group members to the representative's ID.
"""

import logging
from collections import defaultdict

from sqlalchemy.orm import Session

from app.models.enums import RecordStatus
from app.models.staging import StagedRecord
from app.record_types import get as get_record_type

logger = logging.getLogger(__name__)


def _count_populated(record: StagedRecord, field_keys: tuple[str, ...]) -> int:
    """Count non-empty type-declared fields on a record (reading from JSONB)."""
    fields = record.fields or {}
    return sum(1 for key in field_keys if (value := fields.get(key)) is not None and str(value).strip())


def _pick_representative(members: list[StagedRecord], field_keys: tuple[str, ...]) -> StagedRecord:
    """Pick the group representative: most populated fields, lowest ID tiebreak."""
    return max(members, key=lambda r: (_count_populated(r, field_keys), -r.id))


def group_intra_source(db: Session, type_key: str, source_ids: list[int]) -> dict:
    """Group exact-name duplicates within each source for one record type.

    Args:
        db: Database session.
        type_key: RecordType key (e.g. "supplier"). Only records of this type are grouped.
        source_ids: List of data source IDs to process.

    Returns:
        Dict with groups_formed, rows_grouped, representatives counts.
    """
    rt = get_record_type(type_key)
    field_keys = rt.field_keys

    # Idempotency: clear existing group assignments for these sources within this type
    db.query(StagedRecord).filter(
        StagedRecord.type == type_key,
        StagedRecord.data_source_id.in_(source_ids),
        StagedRecord.status == RecordStatus.ACTIVE,
        StagedRecord.intra_source_group_id.isnot(None),
    ).update(
        {StagedRecord.intra_source_group_id: None},
        synchronize_session="fetch",
    )

    records = (
        db.query(StagedRecord)
        .filter(
            StagedRecord.type == type_key,
            StagedRecord.data_source_id.in_(source_ids),
            StagedRecord.status == RecordStatus.ACTIVE,
        )
        .all()
    )

    groups: dict[tuple[int, str], list[StagedRecord]] = defaultdict(list)
    for r in records:
        if r.normalized_name:
            groups[(r.data_source_id, r.normalized_name)].append(r)

    groups_formed = 0
    rows_grouped = 0

    for _key, members in groups.items():
        if len(members) < 2:
            continue
        rep = _pick_representative(members, field_keys)
        for member in members:
            member.intra_source_group_id = rep.id
        groups_formed += 1
        rows_grouped += len(members)

    db.flush()

    representatives = groups_formed
    logger.info(
        "Intra-source grouping(type=%s): %d groups, %d rows grouped, %d representatives",
        type_key,
        groups_formed,
        rows_grouped,
        representatives,
    )

    return {
        "groups_formed": groups_formed,
        "rows_grouped": rows_grouped,
        "representatives": representatives,
    }
