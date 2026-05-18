"""Intra-source grouping service — collapses duplicate rows within each data source.

Records group together (within a single source) if any of these keys match:
- normalized_name (aggressive: legal-suffix + stopword + currency stripping)
- loose_name (conservative: legal-suffix stripping only)
- business_code value (exact match on the CODE-role identifier, when populated)

Sets intra_source_group_id on all group members to the representative's ID
(the row with the most populated declared fields; lowest ID breaks ties).
The business_code key is source-scoped and never crosses sources.
"""

import logging
from collections import defaultdict

from sqlalchemy.orm import Session

from app.models.enums import RecordStatus
from app.models.staging import StagedRecord
from app.record_types import get as get_record_type
from app.services.normalization import loose_name

logger = logging.getLogger(__name__)

CODE_FIELD = "business_code"


def _count_populated(record: StagedRecord, field_keys: tuple[str, ...]) -> int:
    fields = record.fields or {}
    return sum(1 for key in field_keys if (value := fields.get(key)) is not None and str(value).strip())


def _pick_representative(members: list[StagedRecord], field_keys: tuple[str, ...]) -> StagedRecord:
    return max(members, key=lambda r: (_count_populated(r, field_keys), -r.id))


def group_intra_source(db: Session, type_key: str, source_ids: list[int]) -> dict:
    rt = get_record_type(type_key)
    field_keys = rt.field_keys

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

    # Union-find over record indices. Each record can contribute up to three
    # keys, all scoped by data_source_id so business_code never crosses sources.
    parent = list(range(len(records)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i: int, j: int) -> None:
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[ri] = rj

    buckets: dict[tuple, list[int]] = defaultdict(list)
    for i, r in enumerate(records):
        src = r.data_source_id
        if r.normalized_name:
            buckets[("name", src, r.normalized_name)].append(i)
        loose = loose_name(r.name) if r.name else ""
        if loose:
            buckets[("loose", src, loose)].append(i)
        code_val = (r.fields or {}).get(CODE_FIELD)
        if isinstance(code_val, str) and code_val.strip():
            buckets[("code", src, code_val.strip())].append(i)

    for indices in buckets.values():
        if len(indices) < 2:
            continue
        head = indices[0]
        for j in indices[1:]:
            union(head, j)

    final_groups: dict[int, list[StagedRecord]] = defaultdict(list)
    for i, r in enumerate(records):
        final_groups[find(i)].append(r)

    groups_formed = 0
    rows_grouped = 0
    for members in final_groups.values():
        if len(members) < 2:
            continue
        rep = _pick_representative(members, field_keys)
        for member in members:
            member.intra_source_group_id = rep.id
        groups_formed += 1
        rows_grouped += len(members)

    db.flush()

    logger.info(
        "Intra-source grouping(type=%s, sources=%s): %d groups, %d rows grouped",
        type_key,
        source_ids,
        groups_formed,
        rows_grouped,
    )

    return {
        "groups_formed": groups_formed,
        "rows_grouped": rows_grouped,
        "representatives": groups_formed,
    }
