"""Unified records API router — list, detail, singleton promotion, export, dashboard."""

import csv
import io
from datetime import UTC, date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db, require_role
from app.models.audit import AuditLog
from app.models.batch import ImportBatch
from app.models.enums import (
    BatchStatus,
    CandidateStatus,
    RecordStatus,
    UserRole,
)
from app.models.match import MatchCandidate
from app.models.source import DataSource
from app.models.staging import StagedRecord
from app.models.unified import UnifiedRecord
from app.models.user import User
from app.record_types import get as get_record_type
from app.schemas.unified import (
    BulkPromoteRequest,
    BulkPromoteResponse,
    DashboardResponse,
    FieldProvenance,
    LineageEvent,
    LineageResponse,
    MatchStats,
    MergeHistoryEntry,
    PromoteResponse,
    RecentActivity,
    ReviewProgress,
    SingletonCandidate,
    SingletonListResponse,
    SourceRecord,
    UnifiedRecordDetail,
    UnifiedRecordListItem,
    UnifiedRecordListResponse,
    UnifiedStats,
    UploadStats,
)
from app.services.audit import log_action

router = APIRouter(prefix="/api/unified", tags=["unified"])


def _build_unified_filter(
    query,
    search: str | None = None,
    is_singleton: bool | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    type: str | None = None,
):
    """Apply optional filters to a UnifiedRecord query."""
    if type is not None:
        query = query.filter(UnifiedRecord.type == type)
    if search:
        query = query.filter(UnifiedRecord.name.ilike(f"%{search}%"))
    if is_singleton is True:
        query = query.filter(func.json_array_length(UnifiedRecord.source_record_ids) <= 1)
    elif is_singleton is False:
        query = query.filter(func.json_array_length(UnifiedRecord.source_record_ids) > 1)
    if from_date:
        query = query.filter(UnifiedRecord.created_at >= from_date)
    if to_date:
        query = query.filter(UnifiedRecord.created_at < to_date + timedelta(days=1))
    return query


@router.get("/count")
def get_unified_count(
    type: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    n = db.query(func.count(UnifiedRecord.id)).filter(UnifiedRecord.type == type).scalar() or 0
    return {"count": n}


@router.get("/records", response_model=UnifiedRecordListResponse)
def list_unified_records(
    type: str | None = Query(None, description="Filter by record type"),
    search: str | None = Query(None),
    is_singleton: bool | None = Query(None),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List unified records with optional filters."""
    query = db.query(UnifiedRecord)
    query = _build_unified_filter(query, search, is_singleton, from_date, to_date, type)

    total = query.count()
    records = query.order_by(UnifiedRecord.created_at.desc()).offset(offset).limit(limit).all()

    items = []
    for r in records:
        source_ids = r.source_record_ids or []
        items.append(
            UnifiedRecordListItem(
                id=r.id,
                type=r.type,
                name=r.name,
                fields=r.fields or {},
                source_count=len(source_ids),
                is_singleton=len(r.source_record_ids or []) <= 1,
                created_by=r.created_by,
                created_at=r.created_at,
                dq_completeness=r.dq_completeness,
                dq_validity=r.dq_validity,
                dq_score=r.dq_score,
            )
        )

    return UnifiedRecordListResponse(
        items=items,
        total=total,
        has_more=(offset + limit) < total,
    )


@router.get("/records/{record_id}", response_model=UnifiedRecordDetail)
def get_unified_record(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a unified record with provenance, source records, and merge history."""
    unified = db.get(UnifiedRecord, record_id)
    if unified is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unified record {record_id} not found",
        )

    source_ids = unified.source_record_ids or []
    source_records: list[SourceRecord] = []
    if source_ids:
        rows = (
            db.query(
                StagedRecord.id,
                StagedRecord.type,
                StagedRecord.name,
                StagedRecord.fields,
                StagedRecord.data_source_id,
                DataSource.name.label("source_name"),
            )
            .join(DataSource, StagedRecord.data_source_id == DataSource.id)
            .filter(StagedRecord.id.in_(source_ids))
            .all()
        )
        source_records = [
            SourceRecord(
                id=r.id,
                type=r.type,
                name=r.name,
                fields=r.fields or {},
                data_source_id=r.data_source_id,
                data_source_name=r.source_name,
            )
            for r in rows
        ]

    # Merge history: audit log entries for the source records and the unified record
    audit_rows = (
        db.query(AuditLog)
        .filter(
            ((AuditLog.entity_type == "staged_record") & (AuditLog.entity_id.in_(source_ids)))
            | ((AuditLog.entity_type == "match_candidate") & (AuditLog.entity_id.in_(source_ids)))
            | ((AuditLog.entity_type == "unified_record") & (AuditLog.entity_id == unified.id))
        )
        .order_by(AuditLog.created_at.desc())
        .all()
        if source_ids or unified.id
        else []
    )
    merge_history = [
        MergeHistoryEntry(
            id=a.id,
            action=a.action,
            details=a.details,
            created_at=a.created_at,
        )
        for a in audit_rows
    ]

    provenance: dict[str, FieldProvenance] = {}
    for k, v in (unified.provenance or {}).items():
        if isinstance(v, dict):
            provenance[k] = FieldProvenance(**v)

    return UnifiedRecordDetail(
        id=unified.id,
        type=unified.type,
        name=unified.name,
        fields=unified.fields or {},
        provenance=provenance,
        source_record_ids=source_ids,
        source_records=source_records,
        merge_history=merge_history,
        created_by=unified.created_by,
        created_at=unified.created_at,
        dq_completeness=unified.dq_completeness,
        dq_validity=unified.dq_validity,
        dq_score=unified.dq_score,
    )


def _get_singleton_ids(db: Session, type_key: str | None = None) -> set[int]:
    """Return record IDs that have appeared as either side of a match candidate."""
    a_query = db.query(MatchCandidate.record_a_id)
    b_query = db.query(MatchCandidate.record_b_id)
    if type_key is not None:
        a_query = a_query.filter(MatchCandidate.type == type_key)
        b_query = b_query.filter(MatchCandidate.type == type_key)
    a_ids = {row[0] for row in a_query.distinct().all()}
    b_ids = {row[0] for row in b_query.distinct().all()}
    return a_ids | b_ids


def _get_already_unified_ids(db: Session, type_key: str | None = None) -> set[int]:
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


@router.get("/singletons", response_model=SingletonListResponse)
def list_singletons(
    type: str | None = Query(None, description="Filter by record type"),
    search: str | None = Query(None),
    source_id: int | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List staged records eligible for singleton promotion.

    A singleton is an active record that:
    - Is not a member of any (non-invalidated) match candidate
    - Has not already been promoted (not in any UnifiedRecord.source_record_ids)
    - Is the representative of its intra-source group (or has no group)
    """
    paired_ids = _get_singleton_ids(db, type)
    unified_ids = _get_already_unified_ids(db, type)
    exclude_ids = paired_ids | unified_ids

    query = (
        db.query(
            StagedRecord.id,
            StagedRecord.type,
            StagedRecord.name,
            StagedRecord.fields,
            StagedRecord.data_source_id,
            DataSource.name.label("source_name"),
        )
        .join(DataSource, StagedRecord.data_source_id == DataSource.id)
        .filter(StagedRecord.status == RecordStatus.ACTIVE)
        .filter(StagedRecord.intra_source_group_id.is_(None) | (StagedRecord.intra_source_group_id == StagedRecord.id))
    )
    if type is not None:
        query = query.filter(StagedRecord.type == type)
    if exclude_ids:
        query = query.filter(StagedRecord.id.notin_(exclude_ids))
    if search:
        query = query.filter(StagedRecord.name.ilike(f"%{search}%"))
    if source_id is not None:
        query = query.filter(StagedRecord.data_source_id == source_id)

    total = query.count()
    rows = query.order_by(StagedRecord.name).offset(offset).limit(limit).all()

    items = [
        SingletonCandidate(
            id=r.id,
            type=r.type,
            name=r.name,
            fields=r.fields or {},
            data_source_id=r.data_source_id,
            data_source_name=r.source_name,
        )
        for r in rows
    ]

    return SingletonListResponse(
        items=items,
        total=total,
        has_more=(offset + limit) < total,
    )


def _build_singleton_unified(record: StagedRecord, source_name: str | None, username: str) -> UnifiedRecord:
    """Construct a UnifiedRecord from a single StagedRecord (no merge — direct promotion)."""
    rt = get_record_type(record.type)
    now = datetime.now(UTC).isoformat()
    fields_payload: dict[str, Any] = dict(record.fields or {})
    name = fields_payload.get(rt.name_field.key) or record.name
    if not name:
        raise ValueError(f"Singleton record must have a '{rt.name_field.key}' value")

    provenance: dict[str, Any] = {}
    for fdef in rt.fields:
        val = fields_payload.get(fdef.key)
        provenance[fdef.key] = {
            "value": val,
            "source_entity": source_name,
            "source_record_id": record.id,
            "auto": True,
            "chosen_by": username,
            "chosen_at": now,
        }
    return UnifiedRecord(
        type=record.type,
        name=name,
        fields=fields_payload,
        provenance=provenance,
        source_record_ids=[record.id],
        created_by=username,
    )


@router.post("/singletons/{record_id}/promote", response_model=PromoteResponse)
def promote_singleton(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.REVIEWER)),
):
    """Promote a singleton staged record to a unified record."""
    record = db.get(StagedRecord, record_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Staged record {record_id} not found",
        )
    if record.status != RecordStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Record is {record.status}, cannot promote",
        )

    # Conflict checks
    paired = (
        db.query(MatchCandidate.id)
        .filter((MatchCandidate.record_a_id == record_id) | (MatchCandidate.record_b_id == record_id))
        .first()
    )
    if paired:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Record is part of a match candidate; promote via merge flow instead",
        )
    already_unified = (
        db.query(UnifiedRecord.id).filter(UnifiedRecord.source_record_ids.contains([record_id])).first()
        if hasattr(UnifiedRecord.source_record_ids, "contains")
        else None
    )
    if already_unified:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Record is already part of a unified record",
        )

    source = db.get(DataSource, record.data_source_id)
    source_name = source.name if source else None

    try:
        unified = _build_singleton_unified(record, source_name, current_user.username)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    db.add(unified)
    db.flush()

    log_action(
        db,
        user_id=current_user.id,
        action="singleton_promoted",
        entity_type="unified_record",
        entity_id=unified.id,
        details={
            "type": record.type,
            "source_record_id": record.id,
            "name": unified.name,
        },
    )
    db.commit()

    return PromoteResponse(
        unified_record_id=unified.id,
        record_name=unified.name,
        message=f"Singleton {record_id} promoted to unified record {unified.id}",
    )


@router.post("/singletons/bulk-promote", response_model=BulkPromoteResponse)
def bulk_promote_singletons(
    body: BulkPromoteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.REVIEWER)),
):
    """Promote multiple singletons in a single request."""
    promoted_ids: list[int] = []

    for sid in body.record_ids:
        record = db.get(StagedRecord, sid)
        if record is None or record.status != RecordStatus.ACTIVE:
            continue

        paired = (
            db.query(MatchCandidate.id)
            .filter((MatchCandidate.record_a_id == sid) | (MatchCandidate.record_b_id == sid))
            .first()
        )
        if paired:
            continue

        source = db.get(DataSource, record.data_source_id)
        source_name = source.name if source else None
        try:
            unified = _build_singleton_unified(record, source_name, current_user.username)
        except ValueError:
            continue
        db.add(unified)
        db.flush()
        promoted_ids.append(unified.id)

        log_action(
            db,
            user_id=current_user.id,
            action="singleton_promoted",
            entity_type="unified_record",
            entity_id=unified.id,
            details={
                "type": record.type,
                "source_record_id": record.id,
                "name": unified.name,
                "bulk": True,
            },
        )

    db.commit()

    return BulkPromoteResponse(
        promoted_count=len(promoted_ids),
        unified_record_ids=promoted_ids,
    )


@router.get("/export")
def export_unified_csv(
    type: str | None = Query(None, description="Filter by record type"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export unified records as CSV. With type filter, columns match the type's fields."""
    query = db.query(UnifiedRecord)
    if type is not None:
        query = query.filter(UnifiedRecord.type == type)
    records = query.order_by(UnifiedRecord.name).all()

    # Build columns
    if type is not None:
        rt = get_record_type(type)
        field_keys = [f.key for f in rt.fields]
    else:
        # No type filter: emit a generic header (id, type, name, fields-as-json)
        field_keys = []

    output = io.StringIO()
    writer = csv.writer(output)

    if type is not None:
        writer.writerow(["id", "type", "name", *field_keys, "source_count", "created_by", "created_at"])
        for r in records:
            row = [r.id, r.type, r.name]
            for k in field_keys:
                row.append((r.fields or {}).get(k) or "")
            row.append(len(r.source_record_ids or []))
            row.append(r.created_by or "")
            row.append(r.created_at.isoformat() if r.created_at else "")
            writer.writerow(row)
    else:
        writer.writerow(["id", "type", "name", "fields_json", "source_count", "created_by", "created_at"])
        for r in records:
            import json as _json

            writer.writerow(
                [
                    r.id,
                    r.type,
                    r.name,
                    _json.dumps(r.fields or {}, ensure_ascii=False),
                    len(r.source_record_ids or []),
                    r.created_by or "",
                    r.created_at.isoformat() if r.created_at else "",
                ]
            )

    output.seek(0)
    timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    suffix = f"_{type}" if type else ""
    filename = f"unified_records{suffix}_{timestamp}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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
    merged = unified_query.filter(func.json_array_length(UnifiedRecord.source_record_ids) > 1).count()
    singletons_count = unified_query.filter(func.json_array_length(UnifiedRecord.source_record_ids) <= 1).count()

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


@router.get("/{record_id}/lineage", response_model=LineageResponse)
def get_lineage(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Chronological events for a unified record (audit + provenance combined)."""
    record = db.get(UnifiedRecord, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Unified record not found")

    events: list[LineageEvent] = []

    audit_rows = (
        db.query(AuditLog)
        .filter(AuditLog.entity_type == "unified_record", AuditLog.entity_id == record_id)
        .order_by(AuditLog.created_at.asc())
        .all()
    )
    for a in audit_rows:
        events.append(
            LineageEvent(
                at=a.created_at.isoformat() if a.created_at else "",
                kind=_audit_action_to_kind(a.action),
                actor=str(a.user_id) if a.user_id else None,
                summary=a.action.replace("_", " "),
                details=a.details,
            )
        )

    for field_key, prov in (record.provenance or {}).items():
        if not isinstance(prov, dict):
            continue
        events.append(
            LineageEvent(
                at=str(prov.get("chosen_at") or ""),
                kind="field_set",
                actor=prov.get("chosen_by"),
                summary=f"Field '{field_key}' set from {prov.get('source_entity') or 'unknown source'}",
                details={"field": field_key, "value": prov.get("value"), "auto": prov.get("auto")},
            )
        )

    events.sort(key=lambda e: e.at, reverse=True)
    return LineageResponse(events=events)


def _audit_action_to_kind(action: str) -> str:
    if action.startswith("merge"):
        return "merged"
    if action.startswith("match_rejected"):
        return "reviewed"
    if action == "supersede":
        return "superseded"
    if action == "ingest":
        return "ingested"
    return "reviewed"
