"""Insights tab — aggregate read-only queries over unified records."""

from fastapi import APIRouter, Depends
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.models.unified import UnifiedRecord
from app.models.user import User
from app.schemas.insights import BucketCount, InsightsDqResponse, PerSourceDq, WorstRecord

router = APIRouter(prefix="/api/insights", tags=["insights"])

_BUCKETS = [
    ("<0.2", 0.0, 0.2),
    ("0.2-0.4", 0.2, 0.4),
    ("0.4-0.6", 0.4, 0.6),
    ("0.6-0.8", 0.6, 0.8),
    (">=0.8", 0.8, 1.01),  # inclusive of 1.0
]


@router.get("/dq", response_model=InsightsDqResponse)
def get_dq_insights(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InsightsDqResponse:
    avg = db.query(func.avg(UnifiedRecord.dq_score)).scalar() or 0.0

    distribution = []
    for label, lo, hi in _BUCKETS:
        n = (
            db.query(func.count(UnifiedRecord.id))
            .filter(UnifiedRecord.dq_score >= lo, UnifiedRecord.dq_score < hi)
            .scalar()
            or 0
        )
        distribution.append(BucketCount(bucket=label, count=n))

    per_source = _per_source_aggregate(db)

    worst_rows = (
        db.query(UnifiedRecord)
        .filter(UnifiedRecord.dq_score.isnot(None))
        .order_by(UnifiedRecord.dq_score.asc())
        .limit(20)
        .all()
    )
    worst = [
        WorstRecord(
            id=r.id,
            record_type=r.type,
            source_name=None,
            dq_score=float(r.dq_score),
            dq_completeness=r.dq_completeness,
            dq_validity=r.dq_validity,
        )
        for r in worst_rows
    ]

    return InsightsDqResponse(
        avg_dq=float(avg),
        distribution=distribution,
        per_source=per_source,
        worst=worst,
    )


_PER_SOURCE_SQL = {
    "postgresql": """
        SELECT ds.id AS sid, ds.name AS sname,
               COUNT(u.id) AS n, AVG(u.dq_score) AS a
        FROM data_sources ds
        JOIN staged_records sr ON sr.data_source_id = ds.id
        JOIN unified_records u ON (u.source_record_ids ->> 0)::int = sr.id
        GROUP BY ds.id, ds.name
        ORDER BY AVG(u.dq_score) ASC
    """,
    "sqlite": """
        SELECT ds.id AS sid, ds.name AS sname,
               COUNT(u.id) AS n, AVG(u.dq_score) AS a
        FROM data_sources ds
        JOIN staged_records sr ON sr.data_source_id = ds.id
        JOIN unified_records u ON CAST(json_extract(u.source_record_ids, '$[0]') AS INTEGER) = sr.id
        GROUP BY ds.id, ds.name
        ORDER BY AVG(u.dq_score) ASC
    """,
}


def _per_source_aggregate(db: Session) -> list[PerSourceDq]:
    dialect = db.bind.dialect.name if db.bind is not None else ""
    sql = _PER_SOURCE_SQL.get(dialect)
    if sql is None:
        return []
    try:
        rows = db.execute(text(sql)).all()
    except Exception:
        db.rollback()
        return []
    return [PerSourceDq(source_id=r.sid, source_name=r.sname, count=r.n, avg_dq=float(r.a or 0)) for r in rows]
