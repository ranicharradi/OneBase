"""Merge service — produces golden records from reviewed match candidates.

Driven by the candidate's RecordType: every FieldDef on the type produces one
field-comparison entry; the merged UnifiedRecord stores values keyed by FieldDef.key.

Provenance per merged field tracks: source record ID, source entity name,
auto/manual, chosen_by, chosen_at.
"""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models.enums import CandidateStatus
from app.models.match import MatchCandidate
from app.models.staging import StagedRecord
from app.models.unified import UnifiedRecord
from app.record_types import RecordType
from app.record_types import get as get_record_type
from app.services.audit import log_action


def _normalize_value(val: Any) -> str | None:
    """Normalize a field value for comparison (strip whitespace, treat empty as None)."""
    if val is None:
        return None
    s = str(val).strip()
    return s if s else None


def _field_value(record: StagedRecord, field_key: str) -> str | None:
    """Read a field value from a record's JSONB store."""
    fields = record.fields or {}
    return _normalize_value(fields.get(field_key))


def compare_fields(
    record_a: StagedRecord,
    record_b: StagedRecord,
    source_a_name: str,
    source_b_name: str,
    record_type: RecordType | None = None,
) -> list[dict]:
    """Compare type-declared fields between two records."""
    if record_a.type != record_b.type:
        raise ValueError(f"compare_fields received records of differing types: {record_a.type!r} vs {record_b.type!r}")
    rt = record_type or get_record_type(record_a.type)

    comparisons = []
    for fdef in rt.fields:
        val_a = _field_value(record_a, fdef.key)
        val_b = _field_value(record_b, fdef.key)
        comp = {
            "field": fdef.key,
            "label": fdef.label,
            "value_a": val_a,
            "value_b": val_b,
            "source_a": source_a_name,
            "source_b": source_b_name,
            "is_conflict": False,
            "is_identical": False,
            "is_a_only": False,
            "is_b_only": False,
        }
        if val_a is not None and val_b is not None:
            comp["is_identical" if val_a == val_b else "is_conflict"] = True
        elif val_a is not None:
            comp["is_a_only"] = True
        elif val_b is not None:
            comp["is_b_only"] = True
        comparisons.append(comp)
    return comparisons


def _expand_group_members(db: Session, record_id: int) -> list[int]:
    """Return all StagedRecord IDs in the same intra-source group."""
    record = db.get(StagedRecord, record_id)
    if record is None:
        return [record_id]
    group_id = record.intra_source_group_id
    if group_id is None:
        return [record_id]
    member_ids = db.query(StagedRecord.id).filter(StagedRecord.intra_source_group_id == group_id).all()
    return [m.id for m in member_ids]


def _update_existing_unified(
    db: Session,
    candidate: MatchCandidate,
    staged: StagedRecord,
    unified: UnifiedRecord,
    staged_source_name: str,
    field_selections: list[dict],
    username: str,
) -> UnifiedRecord:
    """Update an existing UnifiedRecord when merging a staged record into a golden."""
    from sqlalchemy.orm.attributes import flag_modified

    rt = get_record_type(candidate.type)
    now = datetime.now(UTC).isoformat()
    selection_map = {fs["field"]: fs["chosen_record_id"] for fs in field_selections}

    # Work on copies so SQLAlchemy detects the change when we reassign.
    new_fields = dict(unified.fields or {})
    new_provenance = dict(unified.provenance or {})

    # Build a unified view of all fields: declared RecordType fields + any extra fields
    # present in staged.fields or unified.fields not covered by the RecordType.
    declared_keys = {fdef.key for fdef in rt.fields}
    staged_fields = staged.fields or {}
    unified_fields_src = unified.fields or {}
    extra_keys = (set(staged_fields.keys()) | set(unified_fields_src.keys())) - declared_keys

    # Process declared fields via compare_fields
    comparisons = compare_fields(staged, unified, staged_source_name, "Golden", rt)

    # Add extra-field comparisons manually
    for key in extra_keys:
        val_a = _normalize_value(staged_fields.get(key))
        val_b = _normalize_value(unified_fields_src.get(key))
        comp: dict[str, Any] = {
            "field": key,
            "value_a": val_a,
            "value_b": val_b,
            "is_conflict": False,
            "is_identical": False,
            "is_a_only": False,
            "is_b_only": False,
        }
        if val_a is not None and val_b is not None:
            comp["is_identical" if val_a == val_b else "is_conflict"] = True
        elif val_a is not None:
            comp["is_a_only"] = True
        elif val_b is not None:
            comp["is_b_only"] = True
        comparisons.append(comp)

    for comp in comparisons:
        field = comp["field"]
        if comp["is_b_only"]:
            continue  # Golden already has it; keep.
        if comp["is_a_only"]:
            new_fields[field] = comp["value_a"]
            new_provenance[field] = {
                "value": comp["value_a"],
                "source_entity": staged_source_name,
                "source_record_id": staged.id,
                "auto": True,
                "chosen_by": username,
                "chosen_at": now,
            }
        elif comp["is_conflict"]:
            chosen_id = selection_map.get(field)
            if chosen_id is None:
                # No explicit selection → keep the existing golden value.
                continue
            if chosen_id == staged.id:
                new_fields[field] = comp["value_a"]
                new_provenance[field] = {
                    "value": comp["value_a"],
                    "source_entity": staged_source_name,
                    "source_record_id": staged.id,
                    "auto": False,
                    "chosen_by": username,
                    "chosen_at": now,
                }
            elif chosen_id == unified.id:
                new_provenance[field] = {
                    **new_provenance.get(field, {}),
                    "reaffirmed_by": username,
                    "reaffirmed_at": now,
                }
            else:
                raise ValueError(f"Invalid chosen_record_id {chosen_id} for field '{field}'")
        # is_identical → nothing to do.

    # Reassign to trigger SQLAlchemy JSON change detection.
    unified.fields = new_fields
    unified.provenance = new_provenance
    flag_modified(unified, "fields")
    flag_modified(unified, "provenance")

    expanded = _expand_group_members(db, staged.id)
    unified.source_record_ids = list({*unified.source_record_ids, *expanded})

    candidate.status = CandidateStatus.MERGED
    candidate.reviewed_by = username
    candidate.reviewed_at = datetime.now(UTC)

    # Refresh name if name field changed
    if new_fields.get(rt.name_field.key):
        unified.name = new_fields[rt.name_field.key]

    log_action(
        db,
        user_id=None,
        action="merge_confirmed",
        entity_type="match_candidate",
        entity_id=candidate.id,
        details={"type": candidate.type, "target": "existing_unified", "unified_id": unified.id},
    )
    db.flush()
    return unified


def execute_merge(
    db: Session,
    candidate: MatchCandidate,
    record_a: StagedRecord,
    record_b: StagedRecord,
    source_a_name: str,
    source_b_name: str,
    field_selections: list[dict],
    username: str,
) -> UnifiedRecord:
    """Execute a merge, creating a unified record with full provenance.

    Args:
        field_selections: List of {"field": str, "chosen_record_id": int}
            for conflicting fields.
    """
    # File-vs-Golden: update the existing UnifiedRecord instead of creating a new one.
    if getattr(candidate, "side_b_kind", None) == "unified":
        return _update_existing_unified(db, candidate, record_a, record_b, source_a_name, field_selections, username)
    if getattr(candidate, "side_a_kind", None) == "unified":
        # Normalize: staged is always "a"
        record_a, record_b = record_b, record_a
        source_a_name, source_b_name = source_b_name, source_a_name
        return _update_existing_unified(db, candidate, record_a, record_b, source_a_name, field_selections, username)

    if record_a.type != record_b.type or candidate.type != record_a.type:
        raise ValueError(
            f"Type mismatch in merge: candidate={candidate.type!r}, "
            f"record_a={record_a.type!r}, record_b={record_b.type!r}"
        )
    rt = get_record_type(candidate.type)
    now = datetime.now(UTC).isoformat()
    selection_map = {fs["field"]: fs["chosen_record_id"] for fs in field_selections}
    comparisons = compare_fields(record_a, record_b, source_a_name, source_b_name, rt)

    provenance: dict[str, dict] = {}
    merged_fields: dict[str, str | None] = {}

    for comp in comparisons:
        field = comp["field"]
        if comp["is_identical"]:
            merged_fields[field] = comp["value_a"]
            provenance[field] = {
                "value": comp["value_a"],
                "source_entity": f"{source_a_name} + {source_b_name}",
                "source_record_id": record_a.id,
                "auto": True,
                "chosen_by": username,
                "chosen_at": now,
            }
        elif comp["is_a_only"]:
            merged_fields[field] = comp["value_a"]
            provenance[field] = {
                "value": comp["value_a"],
                "source_entity": source_a_name,
                "source_record_id": record_a.id,
                "auto": True,
                "chosen_by": username,
                "chosen_at": now,
            }
        elif comp["is_b_only"]:
            merged_fields[field] = comp["value_b"]
            provenance[field] = {
                "value": comp["value_b"],
                "source_entity": source_b_name,
                "source_record_id": record_b.id,
                "auto": True,
                "chosen_by": username,
                "chosen_at": now,
            }
        elif comp["is_conflict"]:
            chosen_id = selection_map.get(field)
            if chosen_id is None:
                raise ValueError(f"Missing field selection for conflicting field '{field}'")
            if chosen_id == record_a.id:
                merged_fields[field] = comp["value_a"]
                provenance[field] = {
                    "value": comp["value_a"],
                    "source_entity": source_a_name,
                    "source_record_id": record_a.id,
                    "auto": False,
                    "chosen_by": username,
                    "chosen_at": now,
                }
            elif chosen_id == record_b.id:
                merged_fields[field] = comp["value_b"]
                provenance[field] = {
                    "value": comp["value_b"],
                    "source_entity": source_b_name,
                    "source_record_id": record_b.id,
                    "auto": False,
                    "chosen_by": username,
                    "chosen_at": now,
                }
            else:
                raise ValueError(f"Invalid chosen_record_id {chosen_id} for field '{field}'")
        else:
            merged_fields[field] = None
            provenance[field] = {
                "value": None,
                "source_entity": None,
                "source_record_id": None,
                "auto": True,
                "chosen_by": username,
                "chosen_at": now,
            }

    name_field_key = rt.name_field.key
    merged_name = merged_fields.get(name_field_key)
    if not merged_name:
        raise ValueError(f"Merged record must have a '{name_field_key}' value")

    fields_payload = {k: v for k, v in merged_fields.items() if v is not None}

    unified = UnifiedRecord(
        type=candidate.type,
        name=merged_name,
        fields=fields_payload,
        provenance=provenance,
        source_record_ids=(_expand_group_members(db, record_a.id) + _expand_group_members(db, record_b.id)),
        created_by=username,
    )

    db.add(unified)

    candidate.status = CandidateStatus.MERGED
    candidate.reviewed_by = username
    candidate.reviewed_at = datetime.now(UTC)

    log_action(
        db,
        user_id=None,
        action="merge_confirmed",
        entity_type="match_candidate",
        entity_id=candidate.id,
        details={
            "type": candidate.type,
            "unified_record_name": merged_name,
            "source_record_ids": (_expand_group_members(db, record_a.id) + _expand_group_members(db, record_b.id)),
            "conflict_count": sum(1 for c in comparisons if c["is_conflict"]),
        },
    )

    from app.services.dq import compute_dq

    completeness, validity, score = compute_dq(unified, rt.fields)
    unified.dq_completeness = completeness
    unified.dq_validity = validity
    unified.dq_score = score

    db.flush()
    return unified


def reject_candidate(
    db: Session,
    candidate: MatchCandidate,
    username: str,
) -> None:
    """Mark a match candidate as rejected."""
    candidate.status = CandidateStatus.REJECTED
    candidate.reviewed_by = username
    candidate.reviewed_at = datetime.now(UTC)

    log_action(
        db,
        user_id=None,
        action="match_rejected",
        entity_type="match_candidate",
        entity_id=candidate.id,
        details={"type": candidate.type, "reviewed_by": username},
    )
