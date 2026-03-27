"""Merge service — produces golden records from reviewed match candidates.

Handles:
- Field-by-field comparison and conflict detection
- Auto-inclusion of identical and source-only fields
- User selections for conflicting fields
- Full provenance tracking on every field
- Audit trail logging
"""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models.match import MatchCandidate
from app.models.staging import StagedSupplier
from app.models.unified import UnifiedSupplier
from app.services.audit import log_action

# Canonical fields that participate in merge comparison
CANONICAL_FIELDS = [
    ("name", "Supplier Name"),
    ("source_code", "Supplier Code"),
    ("short_name", "Short Name"),
    ("currency", "Currency"),
    ("payment_terms", "Payment Terms"),
    ("contact_name", "Contact Name"),
    ("supplier_type", "Supplier Type"),
]


def _normalize_value(val: Any) -> str | None:
    """Normalize a field value for comparison (strip whitespace, treat empty as None)."""
    if val is None:
        return None
    s = str(val).strip()
    return s if s else None


def compare_fields(
    supplier_a: StagedSupplier,
    supplier_b: StagedSupplier,
    source_a_name: str,
    source_b_name: str,
) -> list[dict]:
    """Compare canonical fields between two suppliers.

    Returns a list of field comparison dicts with conflict/identical/source-only flags.
    """
    comparisons = []

    for field, label in CANONICAL_FIELDS:
        val_a = _normalize_value(getattr(supplier_a, field, None))
        val_b = _normalize_value(getattr(supplier_b, field, None))

        comp = {
            "field": field,
            "label": label,
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
            if val_a == val_b:
                comp["is_identical"] = True
            else:
                comp["is_conflict"] = True
        elif val_a is not None and val_b is None:
            comp["is_a_only"] = True
        elif val_b is not None and val_a is None:
            comp["is_b_only"] = True
        # Both None: leave all flags False (empty field)

        comparisons.append(comp)

    return comparisons


def _expand_group_members(db: Session, supplier_id: int) -> list[int]:
    """Return all StagedSupplier IDs in the same intra-source group."""
    supplier = db.get(StagedSupplier, supplier_id)
    if supplier is None:
        return [supplier_id]
    group_id = supplier.intra_source_group_id
    if group_id is None:
        return [supplier_id]
    member_ids = db.query(StagedSupplier.id).filter(StagedSupplier.intra_source_group_id == group_id).all()
    return [m.id for m in member_ids]


def execute_merge(
    db: Session,
    candidate: MatchCandidate,
    supplier_a: StagedSupplier,
    supplier_b: StagedSupplier,
    source_a_name: str,
    source_b_name: str,
    field_selections: list[dict],
    username: str,
) -> UnifiedSupplier:
    """Execute a merge, creating a unified supplier with full provenance.

    Args:
        field_selections: List of {"field": str, "chosen_supplier_id": int}
            for conflicting fields. Identical and source-only fields are auto-resolved.

    Returns:
        The created UnifiedSupplier.
    """
    now = datetime.now(UTC).isoformat()
    selection_map = {fs["field"]: fs["chosen_supplier_id"] for fs in field_selections}
    comparisons = compare_fields(supplier_a, supplier_b, source_a_name, source_b_name)

    provenance: dict[str, dict] = {}
    merged_values: dict[str, str | None] = {}

    for comp in comparisons:
        field = comp["field"]

        if comp["is_identical"]:
            # Auto-include identical values
            merged_values[field] = comp["value_a"]
            provenance[field] = {
                "value": comp["value_a"],
                "source_entity": f"{source_a_name} + {source_b_name}",
                "source_record_id": supplier_a.id,
                "auto": True,
                "chosen_by": username,
                "chosen_at": now,
            }

        elif comp["is_a_only"]:
            # Auto-include source-A-only
            merged_values[field] = comp["value_a"]
            provenance[field] = {
                "value": comp["value_a"],
                "source_entity": source_a_name,
                "source_record_id": supplier_a.id,
                "auto": True,
                "chosen_by": username,
                "chosen_at": now,
            }

        elif comp["is_b_only"]:
            # Auto-include source-B-only
            merged_values[field] = comp["value_b"]
            provenance[field] = {
                "value": comp["value_b"],
                "source_entity": source_b_name,
                "source_record_id": supplier_b.id,
                "auto": True,
                "chosen_by": username,
                "chosen_at": now,
            }

        elif comp["is_conflict"]:
            # Conflict — must have user selection
            chosen_id = selection_map.get(field)
            if chosen_id is None:
                raise ValueError(f"Missing field selection for conflicting field '{field}'")

            if chosen_id == supplier_a.id:
                merged_values[field] = comp["value_a"]
                provenance[field] = {
                    "value": comp["value_a"],
                    "source_entity": source_a_name,
                    "source_record_id": supplier_a.id,
                    "auto": False,
                    "chosen_by": username,
                    "chosen_at": now,
                }
            elif chosen_id == supplier_b.id:
                merged_values[field] = comp["value_b"]
                provenance[field] = {
                    "value": comp["value_b"],
                    "source_entity": source_b_name,
                    "source_record_id": supplier_b.id,
                    "auto": False,
                    "chosen_by": username,
                    "chosen_at": now,
                }
            else:
                raise ValueError(f"Invalid chosen_supplier_id {chosen_id} for field '{field}'")
        else:
            # Both None — empty field
            merged_values[field] = None
            provenance[field] = {
                "value": None,
                "source_entity": None,
                "source_record_id": None,
                "auto": True,
                "chosen_by": username,
                "chosen_at": now,
            }

    # Name is required for the golden record
    if not merged_values.get("name"):
        raise ValueError("Merged record must have a name")

    unified = UnifiedSupplier(
        name=merged_values["name"],
        source_code=merged_values.get("source_code"),
        short_name=merged_values.get("short_name"),
        currency=merged_values.get("currency"),
        payment_terms=merged_values.get("payment_terms"),
        contact_name=merged_values.get("contact_name"),
        supplier_type=merged_values.get("supplier_type"),
        provenance=provenance,
        source_supplier_ids=(_expand_group_members(db, supplier_a.id) + _expand_group_members(db, supplier_b.id)),
        match_candidate_id=candidate.id,
        created_by=username,
    )

    db.add(unified)

    # Mark candidate as confirmed
    candidate.status = "confirmed"
    candidate.reviewed_by = username
    candidate.reviewed_at = datetime.now(UTC)

    # Audit trail
    log_action(
        db,
        user_id=None,  # We pass username instead of looking up user
        action="merge_confirmed",
        entity_type="match_candidate",
        entity_id=candidate.id,
        details={
            "unified_supplier_name": merged_values["name"],
            "source_supplier_ids": (
                _expand_group_members(db, supplier_a.id) + _expand_group_members(db, supplier_b.id)
            ),
            "conflict_count": sum(1 for c in comparisons if c["is_conflict"]),
        },
    )

    db.flush()  # Assign ID to unified

    return unified


def reject_candidate(
    db: Session,
    candidate: MatchCandidate,
    username: str,
) -> None:
    """Mark a match candidate as rejected."""
    candidate.status = "rejected"
    candidate.reviewed_by = username
    candidate.reviewed_at = datetime.now(UTC)

    log_action(
        db,
        user_id=None,
        action="match_rejected",
        entity_type="match_candidate",
        entity_id=candidate.id,
        details={"reviewed_by": username},
    )


def skip_candidate(
    db: Session,
    candidate: MatchCandidate,
    username: str,
) -> None:
    """Mark a match candidate as skipped (for later review)."""
    candidate.status = "skipped"
    candidate.reviewed_by = username
    candidate.reviewed_at = datetime.now(UTC)

    log_action(
        db,
        user_id=None,
        action="match_skipped",
        entity_type="match_candidate",
        entity_id=candidate.id,
        details={"reviewed_by": username},
    )
