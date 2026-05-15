"""Singleton-record helpers shared between unified and review routers."""

from sqlalchemy.orm import Session

from app.models.match import MatchCandidate
from app.models.unified import UnifiedRecord


def get_paired_ids(db: Session, type_key: str | None = None) -> set[int]:
    """Return record IDs that have appeared as either side of a match candidate."""
    a_query = db.query(MatchCandidate.record_a_id)
    b_query = db.query(MatchCandidate.record_b_id)
    if type_key is not None:
        a_query = a_query.filter(MatchCandidate.type == type_key)
        b_query = b_query.filter(MatchCandidate.type == type_key)
    a_ids = {row[0] for row in a_query.distinct().all()}
    b_ids = {row[0] for row in b_query.distinct().all()}
    return a_ids | b_ids


def get_already_unified_ids(db: Session, type_key: str | None = None) -> set[int]:
    """Return record IDs that are already part of a unified record."""
    query = db.query(UnifiedRecord.source_record_ids)
    if type_key is not None:
        query = query.filter(UnifiedRecord.type == type_key)
    rows = query.all()
    out: set[int] = set()
    for (ids,) in rows:
        if ids:
            out.update(ids)
    return out
