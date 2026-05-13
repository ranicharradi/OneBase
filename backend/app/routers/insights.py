"""Insights tab — aggregate read-only queries over unified records."""

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.models.source import DataSource
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

    from app.models.staging import StagedRecord

    try:
        per_source_rows = (
            db.query(
                DataSource.id.label("sid"),
                DataSource.name.label("sname"),
                func.count(UnifiedRecord.id).label("n"),
                func.avg(UnifiedRecord.dq_score).label("a"),
            )
            .join(StagedRecord, StagedRecord.data_source_id == DataSource.id)
            .join(
                UnifiedRecord,
                func.json_extract(func.json(UnifiedRecord.source_record_ids), "$[0]") == StagedRecord.id,
            )
            .group_by(DataSource.id, DataSource.name)
            .order_by(func.avg(UnifiedRecord.dq_score).asc())
            .all()
        )
    except Exception:
        per_source_rows = []

    per_source = [
        PerSourceDq(source_id=r.sid, source_name=r.sname, count=r.n, avg_dq=float(r.a or 0)) for r in per_source_rows
    ]

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
