"""Dashboard summary aggregations for the home page."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.models.audit import AuditLog
from app.models.batch import ImportBatch
from app.models.enums import BatchStatus, CandidateStatus, RecordStatus
from app.models.match import MatchCandidate
from app.models.source import DataSource
from app.models.staging import StagedRecord
from app.models.unified import UnifiedRecord
from app.models.user import User
from app.schemas.unified import (
    DashboardResponse,
    MatchStats,
    RecentActivity,
    ReviewProgress,
    UnifiedStats,
    UploadStats,
)

router = APIRouter(prefix="/api/unified", tags=["dashboard"])


@router.get("/dashboard", response_model=DashboardResponse)
def get_dashboard(
    type: str | None = Query(None, description="Filter all stats by record type"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get overall pipeline stats. Optional type filter narrows everything to one type."""
    # Uploads (batches) — type filter requires joining DataSource
    batches_query = db.query(ImportBatch)
    if type is not None:
        batches_query = batches_query.join(DataSource, ImportBatch.data_source_id == DataSource.id).filter(
            DataSource.type == type
        )

    total_batches = batches_query.count()
    completed_batches = batches_query.filter(ImportBatch.status == BatchStatus.COMPLETED).count()
    failed_batches = batches_query.filter(ImportBatch.status == BatchStatus.FAILED).count()

    # Total active records
    staged_query = db.query(func.count(StagedRecord.id)).filter(StagedRecord.status == RecordStatus.ACTIVE)
    if type is not None:
        staged_query = staged_query.filter(StagedRecord.type == type)
    total_staged = staged_query.scalar() or 0

    # Match candidates / groups
    cand_query = db.query(MatchCandidate)
    if type is not None:
        cand_query = cand_query.filter(MatchCandidate.type == type)
    total_candidates = cand_query.count()
    pending = cand_query.filter(MatchCandidate.status == CandidateStatus.PENDING).count()
    confirmed = cand_query.filter(MatchCandidate.status == CandidateStatus.CONFIRMED).count()
    rejected = cand_query.filter(MatchCandidate.status == CandidateStatus.REJECTED).count()

    avg_conf = cand_query.with_entities(func.avg(MatchCandidate.confidence)).scalar()
    total_groups = cand_query.with_entities(MatchCandidate.group_id).distinct().count()

    # Unified records
    unified_query = db.query(UnifiedRecord)
    if type is not None:
        unified_query = unified_query.filter(UnifiedRecord.type == type)
    total_unified = unified_query.count()
    merged = unified_query.filter(func.jsonb_array_length(UnifiedRecord.source_record_ids) > 1).count()
    singletons_count = unified_query.filter(func.jsonb_array_length(UnifiedRecord.source_record_ids) <= 1).count()

    # Recent activity (audit log, last 20)
    recent_audit_query = db.query(AuditLog)
    if type is not None:
        recent_audit_query = recent_audit_query.filter(AuditLog.details["type"].as_string() == type)
    recent_audit = recent_audit_query.order_by(AuditLog.created_at.desc()).limit(20).all()

    return DashboardResponse(
        uploads=UploadStats(
            total_batches=total_batches,
            completed=completed_batches,
            failed=failed_batches,
            total_staged=total_staged,
        ),
        matching=MatchStats(
            total_candidates=total_candidates,
            total_groups=total_groups,
            avg_confidence=float(avg_conf) if avg_conf is not None else None,
        ),
        review=ReviewProgress(
            pending=pending,
            confirmed=confirmed,
            rejected=rejected,
        ),
        unified=UnifiedStats(
            total_unified=total_unified,
            merged=merged,
            singletons=singletons_count,
        ),
        recent_activity=[
            RecentActivity(
                id=a.id,
                action=a.action,
                entity_type=a.entity_type,
                entity_id=a.entity_id,
                entity_name=(a.details.get("name") or a.details.get("filename") or a.details.get("username"))
                if a.details
                else None,
                details=a.details,
                created_at=a.created_at,
            )
            for a in recent_audit
        ],
    )
