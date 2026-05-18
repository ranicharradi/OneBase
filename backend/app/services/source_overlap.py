"""Source-identity probe: detect when a new upload looks like an existing datasource."""

from dataclasses import dataclass

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.enums import RecordStatus
from app.models.source import DataSource
from app.models.staging import StagedRecord


@dataclass(frozen=True)
class OverlapMatch:
    source_id: int
    source_name: str
    overlap_ratio: float
    matched_count: int
    total_count: int


def probe_overlap(
    db: Session,
    *,
    type_key: str,
    incoming_normalized_names: list[str],
    threshold: float = 0.5,
    min_rows: int = 20,
) -> list[OverlapMatch]:
    """Return sources of `type_key` whose ACTIVE rows overlap with the incoming names above `threshold`.

    `incoming_normalized_names` should already be passed through `services.normalization.normalize_name`.
    Placeholder rows (SUP / DIVERS / blank / single-char / pure-digit) are dropped from both numerator
    and denominator — they're inflators in a probe like this.
    Returns empty list if the non-placeholder name count is below `min_rows`.
    """
    from app.services.normalization import is_placeholder_name

    real_names = [n for n in incoming_normalized_names if not is_placeholder_name(n)]
    total = len(real_names)
    if total < min_rows:
        return []
    incoming_set = set(real_names)

    rows = (
        db.query(
            StagedRecord.data_source_id,
            func.count(StagedRecord.id).label("hit_count"),
        )
        .filter(
            StagedRecord.type == type_key,
            StagedRecord.status == RecordStatus.ACTIVE,
            StagedRecord.normalized_name.in_(incoming_set),
        )
        .group_by(StagedRecord.data_source_id)
        .all()
    )
    if not rows:
        return []

    id_to_name = {
        s.id: s.name for s in db.query(DataSource).filter(DataSource.id.in_([r.data_source_id for r in rows])).all()
    }
    out: list[OverlapMatch] = []
    for r in rows:
        ratio = r.hit_count / total
        if ratio >= threshold:
            out.append(
                OverlapMatch(
                    source_id=r.data_source_id,
                    source_name=id_to_name.get(r.data_source_id, "?"),
                    overlap_ratio=ratio,
                    matched_count=r.hit_count,
                    total_count=total,
                )
            )
    out.sort(key=lambda m: m.overlap_ratio, reverse=True)
    return out
