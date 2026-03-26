"""Intra-source grouping service — collapses exact-name duplicates within each data source.

Groups StagedSupplier rows that share the same (data_source_id, normalized_name).
Picks the richest row (most populated canonical fields) as the group representative.
Sets intra_source_group_id on all group members to the representative's ID.
"""

import logging
from collections import defaultdict

from sqlalchemy.orm import Session

from app.models.staging import StagedSupplier

logger = logging.getLogger(__name__)

# Fields used to determine "richness" for representative selection
_CANONICAL_FIELDS = [
    "name", "source_code", "short_name", "currency",
    "payment_terms", "contact_name", "supplier_type",
]


def _count_populated(supplier: StagedSupplier) -> int:
    """Count non-null canonical fields on a supplier."""
    return sum(
        1 for f in _CANONICAL_FIELDS
        if getattr(supplier, f, None) is not None
        and str(getattr(supplier, f)).strip()
    )


def _pick_representative(members: list[StagedSupplier]) -> StagedSupplier:
    """Pick the group representative: most populated canonical fields, lowest ID tiebreak."""
    return max(members, key=lambda s: (_count_populated(s), -s.id))


def group_intra_source(db: Session, source_ids: list[int]) -> dict:
    """Group exact-name duplicates within each source.

    Args:
        db: Database session.
        source_ids: List of data source IDs to process.

    Returns:
        Dict with groups_formed, rows_grouped, representatives counts.
    """
    # Idempotency: clear existing group assignments for these sources (active only)
    db.query(StagedSupplier).filter(
        StagedSupplier.data_source_id.in_(source_ids),
        StagedSupplier.status == "active",
        StagedSupplier.intra_source_group_id.isnot(None),
    ).update(
        {StagedSupplier.intra_source_group_id: None},
        synchronize_session="fetch",
    )

    # Query all active suppliers for given sources
    suppliers = (
        db.query(StagedSupplier)
        .filter(
            StagedSupplier.data_source_id.in_(source_ids),
            StagedSupplier.status == "active",
        )
        .all()
    )

    # Group by (data_source_id, normalized_name)
    groups: dict[tuple[int, str], list[StagedSupplier]] = defaultdict(list)
    for s in suppliers:
        if s.normalized_name:
            groups[(s.data_source_id, s.normalized_name)].append(s)

    groups_formed = 0
    rows_grouped = 0

    for key, members in groups.items():
        if len(members) < 2:
            continue  # Single-member group: leave as NULL

        rep = _pick_representative(members)
        for member in members:
            member.intra_source_group_id = rep.id

        groups_formed += 1
        rows_grouped += len(members)

    db.flush()

    representatives = groups_formed  # One rep per group
    logger.info(
        "Intra-source grouping: %d groups, %d rows grouped, %d representatives",
        groups_formed, rows_grouped, representatives,
    )

    return {
        "groups_formed": groups_formed,
        "rows_grouped": rows_grouped,
        "representatives": representatives,
    }
