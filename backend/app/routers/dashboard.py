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

NOISY_DASHBOARD_ACTIONS = {"login", "login_failed", "llm_call", "singleton_promoted"}
SUMMARIZED_DASHBOARD_ACTIONS = {"match_rejected", "merge_confirmed"}
SUMMARY_ACTIVITY_THRESHOLD = 3


def _record_type_label(details: dict | None) -> str:
    raw = details.get("type") if details else None
    if not raw:
        raw = details.get("record_type") if details else None
    return str(raw).replace("_", " ").capitalize() if raw else "Pipeline"


def _actor_for_activity(audit: AuditLog, usernames_by_id: dict[int, str]) -> str:
    if audit.user_id and audit.user_id in usernames_by_id:
        return usernames_by_id[audit.user_id]
    details = audit.details or {}
    for key in ("reviewed_by", "chosen_by", "uploaded_by", "created_by", "username"):
        value = details.get(key)
        if value:
            return str(value)
    return "System"


def _activity_presentation(action: str, details: dict | None) -> tuple[str, str, str, str] | None:
    record_type = _record_type_label(details)

    match action:
        case "upload":
            return "upload", "info", f"Uploaded {record_type.lower()} batch", "/upload"
        case "delete_batch":
            return "upload", "warn", "Deleted upload batch", "/upload"
        case "create_source":
            return "source", "info", "Created data source", "/sources"
        case "update_source":
            return "source", "info", "Updated data source", "/sources"
        case "delete_source":
            return "source", "warn", "Deleted data source", "/sources"
        case "merge_confirmed":
            return "merge", "ok", "Merged records", "/unified"
        case "match_rejected":
            return "review", "warn", "Rejected match candidate", "/review"
        case "user_created" | "create_user":
            return "system", "info", "Created user", "/users"
        case "user_updated":
            return "system", "info", "Updated user", "/users"
        case "user_deleted":
            return "system", "warn", "Deleted user", "/users"
        case "user_toggled_active":
            return "system", "info", "Toggled user active state", "/users"
        case "user_password_changed":
            return "system", "info", "Changed user password", "/users"
        case _:
            return None


def _summary_title(action: str, count: int) -> str:
    if action == "match_rejected":
        return f"Rejected {count} match candidates"
    if action == "merge_confirmed":
        return f"Merged {count} record groups"
    return f"{count} {action.replace('_', ' ')} events"


def curate_dashboard_activity(audit_rows: list[AuditLog], usernames_by_id: dict[int, str]) -> list[RecentActivity]:
    activity_with_order: list[tuple[int, RecentActivity]] = []
    summary_buckets: dict[tuple[str, str, str], dict] = {}

    for idx, audit in enumerate(audit_rows):
        if audit.action in NOISY_DASHBOARD_ACTIONS:
            continue

        presentation = _activity_presentation(audit.action, audit.details)
        if presentation is None:
            continue

        kind, tone, title, href = presentation
        actor = _actor_for_activity(audit, usernames_by_id)
        record_type = _record_type_label(audit.details)
        action_label = audit.action
        if audit.action in {"upload", "delete_batch"} and audit.user_id is None:
            action_label = f"{record_type.lower()}_action"

        if audit.action in SUMMARIZED_DASHBOARD_ACTIONS:
            key = (action_label, actor, record_type)
            bucket = summary_buckets.setdefault(
                key,
                {
                    "count": 0,
                    "first_idx": idx,
                    "first_audit": audit,
                    "kind": kind,
                    "tone": tone,
                    "href": href,
                    "actor": actor,
                    "record_type": record_type,
                },
            )
            bucket["count"] += 1
            continue

        activity_with_order.append(
            (
                idx,
                RecentActivity(
                    id=audit.id,
                    action=action_label,
                    entity_type=audit.entity_type,
                    entity_id=audit.entity_id,
                    entity_name=None,
                    details=audit.details,
                    created_at=audit.created_at,
                    kind=kind,
                    tone=tone,
                    title=title,
                    subtitle=f"{record_type} pipeline",
                    actor=actor,
                    href=href,
                ),
            )
        )

    for (action, _actor, _record_type), bucket in summary_buckets.items():
        count = bucket["count"]
        if count < SUMMARY_ACTIVITY_THRESHOLD:
            continue

        first_audit = bucket["first_audit"]
        raw_type = first_audit.details.get("type") if first_audit.details else None
        details = {"type": raw_type, "count": count} if raw_type else {"count": count}
        record_type = bucket["record_type"]
        activity_with_order.append(
            (
                bucket["first_idx"],
                RecentActivity(
                    id=first_audit.id,
                    action=action,
                    entity_type=first_audit.entity_type,
                    entity_id=None,
                    entity_name=None,
                    details=details,
                    created_at=first_audit.created_at,
                    kind=bucket["kind"],
                    tone=bucket["tone"],
                    title=_summary_title(action, count),
                    subtitle=f"{record_type} pipeline",
                    actor=bucket["actor"],
                    href=bucket["href"],
                ),
            )
        )

    activity_with_order.sort(key=lambda item: item[0])
    return [item for _idx, item in activity_with_order[:20]]


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
    recent_audit = recent_audit_query.order_by(AuditLog.created_at.desc()).limit(60).all()
    user_ids = {a.user_id for a in recent_audit if a.user_id is not None}
    usernames_by_id = dict(db.query(User.id, User.username).filter(User.id.in_(user_ids)).all()) if user_ids else {}

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
        recent_activity=curate_dashboard_activity(recent_audit, usernames_by_id),
    )
