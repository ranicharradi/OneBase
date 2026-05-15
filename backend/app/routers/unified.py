"""Unified records API router — list, count, detail, singleton list, export, lineage."""

import csv
import io
from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.dependencies import Pagination, get_current_user, get_db, get_or_404, get_pagination
from app.models.audit import AuditLog
from app.models.enums import RecordStatus
from app.models.source import DataSource
from app.models.staging import StagedRecord
from app.models.unified import UnifiedRecord
from app.models.user import User
from app.record_types import get as get_record_type
from app.schemas.unified import (
    FieldProvenance,
    LineageEvent,
    LineageResponse,
    MergeHistoryEntry,
    SingletonCandidate,
    SingletonListResponse,
    SourceRecord,
    UnifiedRecordDetail,
    UnifiedRecordListItem,
    UnifiedRecordListResponse,
)
from app.services.audit import audit_action_to_kind
from app.services.record_lookup import load_enriched_records
from app.services.singleton import get_already_unified_ids, get_paired_ids

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
        query = query.filter(func.jsonb_array_length(UnifiedRecord.source_record_ids) <= 1)
    elif is_singleton is False:
        query = query.filter(func.jsonb_array_length(UnifiedRecord.source_record_ids) > 1)
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
    pagination: Pagination = Depends(get_pagination),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List unified records with optional filters."""
    query = db.query(UnifiedRecord)
    query = _build_unified_filter(query, search, is_singleton, from_date, to_date, type)

    total = query.count()
    records = query.order_by(UnifiedRecord.created_at.desc()).offset(pagination.offset).limit(pagination.limit).all()

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
        has_more=(pagination.offset + pagination.limit) < total,
    )


@router.get("/records/{record_id}", response_model=UnifiedRecordDetail)
def get_unified_record(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a unified record with provenance, source records, and merge history."""
    unified = get_or_404(db, UnifiedRecord, record_id, label=f"Unified record {record_id}")

    source_ids = unified.source_record_ids or []
    enriched = load_enriched_records(db, source_ids)
    source_records = [
        SourceRecord(
            id=r["id"],
            type=r["type"],
            name=r["name"],
            fields=r["fields"],
            data_source_id=r["data_source_id"],
            data_source_name=r["source_name"],
        )
        for r in enriched.values()
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


@router.get("/singletons", response_model=SingletonListResponse)
def list_singletons(
    type: str | None = Query(None, description="Filter by record type"),
    search: str | None = Query(None),
    source_id: int | None = Query(None),
    pagination: Pagination = Depends(get_pagination),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List staged records eligible for singleton promotion.

    A singleton is an active record that:
    - Is not a member of any (non-invalidated) match candidate
    - Has not already been promoted (not in any UnifiedRecord.source_record_ids)
    - Is the representative of its intra-source group (or has no group)
    """
    paired_ids = get_paired_ids(db, type)
    unified_ids = get_already_unified_ids(db, type)
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
    rows = query.order_by(StagedRecord.name).offset(pagination.offset).limit(pagination.limit).all()

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
        has_more=(pagination.offset + pagination.limit) < total,
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


@router.get("/{record_id}/lineage", response_model=LineageResponse)
def get_lineage(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Chronological events for a unified record (audit + provenance combined)."""
    record = get_or_404(db, UnifiedRecord, record_id, label="Unified record")

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
                kind=audit_action_to_kind(a.action),
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
