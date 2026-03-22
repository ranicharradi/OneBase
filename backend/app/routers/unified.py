"""Unified suppliers router — browse, detail, singleton promotion, export, and dashboard."""

import csv
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, case
from sqlalchemy.orm import Session

from app.dependencies import get_db, get_current_user
from app.models.user import User
from app.models.audit import AuditLog
from app.models.batch import ImportBatch
from app.models.match import MatchCandidate, MatchGroup
from app.models.source import DataSource
from app.models.staging import StagedSupplier
from app.models.unified import UnifiedSupplier
from app.services.audit import log_action
from app.schemas.unified import (
    UnifiedSupplierListItem,
    UnifiedSupplierListResponse,
    UnifiedSupplierDetail,
    FieldProvenance,
    SourceRecord,
    MergeHistoryEntry,
    SingletonCandidate,
    SingletonListResponse,
    PromoteResponse,
    BulkPromoteRequest,
    BulkPromoteResponse,
    DashboardResponse,
    UploadStats,
    MatchStats,
    ReviewProgress,
    UnifiedStats,
    RecentActivity,
)

router = APIRouter(prefix="/api/unified", tags=["unified"])


# ── Browse unified suppliers ──


@router.get("/suppliers", response_model=UnifiedSupplierListResponse)
def list_unified_suppliers(
    search: str | None = Query(None, description="Search by name"),
    source_type: str | None = Query(None, description="Filter: merged or singleton"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Browse unified suppliers with search and filtering."""
    query = db.query(UnifiedSupplier)

    if search:
        query = query.filter(UnifiedSupplier.name.ilike(f"%{search}%"))

    if source_type == "singleton":
        query = query.filter(UnifiedSupplier.match_candidate_id.is_(None))
    elif source_type == "merged":
        query = query.filter(UnifiedSupplier.match_candidate_id.isnot(None))

    total = query.count()

    suppliers = (
        query.order_by(UnifiedSupplier.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    items = []
    for s in suppliers:
        source_ids = s.source_supplier_ids or []
        items.append(
            UnifiedSupplierListItem(
                id=s.id,
                name=s.name,
                source_code=s.source_code,
                short_name=s.short_name,
                currency=s.currency,
                supplier_type=s.supplier_type,
                source_count=len(source_ids),
                is_singleton=s.match_candidate_id is None,
                created_by=s.created_by,
                created_at=s.created_at,
            )
        )

    return UnifiedSupplierListResponse(
        items=items,
        total=total,
        has_more=(offset + limit) < total,
    )


# ── Unified supplier detail with provenance and merge history ──


@router.get("/suppliers/{supplier_id}", response_model=UnifiedSupplierDetail)
def get_unified_supplier(
    supplier_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get full unified supplier with provenance, source records, and merge history."""
    unified = db.get(UnifiedSupplier, supplier_id)
    if not unified:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unified supplier {supplier_id} not found",
        )

    # Load source records
    source_records = []
    source_ids = unified.source_supplier_ids or []
    if source_ids:
        rows = (
            db.query(
                StagedSupplier.id,
                StagedSupplier.name,
                StagedSupplier.source_code,
                StagedSupplier.data_source_id,
                DataSource.name.label("data_source_name"),
            )
            .join(DataSource, StagedSupplier.data_source_id == DataSource.id)
            .filter(StagedSupplier.id.in_(source_ids))
            .all()
        )
        source_records = [
            SourceRecord(
                id=r.id,
                name=r.name,
                source_code=r.source_code,
                data_source_name=r.data_source_name,
                data_source_id=r.data_source_id,
            )
            for r in rows
        ]

    # Load merge history from audit log
    merge_history = []
    # Match on entity_type='match_candidate' for the merge event
    if unified.match_candidate_id:
        audit_entries = (
            db.query(AuditLog)
            .filter(
                AuditLog.entity_type == "match_candidate",
                AuditLog.entity_id == unified.match_candidate_id,
            )
            .order_by(AuditLog.created_at.desc())
            .all()
        )
        merge_history = [
            MergeHistoryEntry(
                id=e.id,
                action=e.action,
                details=e.details,
                created_at=e.created_at,
            )
            for e in audit_entries
        ]

    # Also include singleton promotion audit entries
    singleton_entries = (
        db.query(AuditLog)
        .filter(
            AuditLog.entity_type == "unified_supplier",
            AuditLog.entity_id == unified.id,
        )
        .order_by(AuditLog.created_at.desc())
        .all()
    )
    merge_history.extend(
        [
            MergeHistoryEntry(
                id=e.id,
                action=e.action,
                details=e.details,
                created_at=e.created_at,
            )
            for e in singleton_entries
        ]
    )

    # Parse provenance dict
    prov = {}
    if unified.provenance:
        for field, data in unified.provenance.items():
            if isinstance(data, dict):
                prov[field] = FieldProvenance(**data)
            else:
                prov[field] = FieldProvenance(value=str(data))

    return UnifiedSupplierDetail(
        id=unified.id,
        name=unified.name,
        source_code=unified.source_code,
        short_name=unified.short_name,
        currency=unified.currency,
        payment_terms=unified.payment_terms,
        contact_name=unified.contact_name,
        supplier_type=unified.supplier_type,
        provenance=prov,
        source_supplier_ids=source_ids,
        source_records=source_records,
        match_candidate_id=unified.match_candidate_id,
        merge_history=merge_history,
        created_by=unified.created_by,
        created_at=unified.created_at,
    )


# ── Singleton promotion ──


def _get_singleton_ids(db: Session) -> set[int]:
    """Get IDs of staged suppliers that appear in ANY match candidate pair."""
    # Get all supplier IDs that are part of a match candidate
    a_ids = db.query(MatchCandidate.supplier_a_id).distinct().subquery()
    b_ids = db.query(MatchCandidate.supplier_b_id).distinct().subquery()

    matched_a = {r[0] for r in db.query(a_ids).all()}
    matched_b = {r[0] for r in db.query(b_ids).all()}
    return matched_a | matched_b


def _get_already_unified_ids(db: Session) -> set[int]:
    """Get staged supplier IDs that are already part of a unified record."""
    unified_records = db.query(UnifiedSupplier.source_supplier_ids).all()
    already = set()
    for (ids,) in unified_records:
        if ids:
            already.update(ids)
    return already


@router.get("/singletons", response_model=SingletonListResponse)
def list_singletons(
    search: str | None = Query(None, description="Search by name"),
    source_id: int | None = Query(None, description="Filter by data source"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List staged suppliers eligible for singleton promotion.

    A singleton is a supplier that:
    - Is active (not superseded)
    - Does not appear in any match candidate pair
    - Has not already been unified (not in any unified record's source_supplier_ids)
    """
    matched_ids = _get_singleton_ids(db)
    already_unified = _get_already_unified_ids(db)
    exclude_ids = matched_ids | already_unified

    query = (
        db.query(
            StagedSupplier.id,
            StagedSupplier.name,
            StagedSupplier.source_code,
            StagedSupplier.short_name,
            StagedSupplier.currency,
            StagedSupplier.payment_terms,
            StagedSupplier.contact_name,
            StagedSupplier.supplier_type,
            StagedSupplier.data_source_id,
            DataSource.name.label("data_source_name"),
        )
        .join(DataSource, StagedSupplier.data_source_id == DataSource.id)
        .filter(StagedSupplier.status == "active")
    )

    if exclude_ids:
        query = query.filter(StagedSupplier.id.notin_(exclude_ids))

    if search:
        query = query.filter(StagedSupplier.name.ilike(f"%{search}%"))

    if source_id is not None:
        query = query.filter(StagedSupplier.data_source_id == source_id)

    total = query.count()

    rows = query.order_by(StagedSupplier.name).offset(offset).limit(limit).all()

    items = [
        SingletonCandidate(
            id=r.id,
            name=r.name,
            source_code=r.source_code,
            short_name=r.short_name,
            currency=r.currency,
            payment_terms=r.payment_terms,
            contact_name=r.contact_name,
            supplier_type=r.supplier_type,
            data_source_id=r.data_source_id,
            data_source_name=r.data_source_name,
        )
        for r in rows
    ]

    return SingletonListResponse(items=items, total=total, has_more=(offset + limit) < total)


@router.post("/singletons/{supplier_id}/promote", response_model=PromoteResponse)
def promote_singleton(
    supplier_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Promote a singleton supplier directly into the unified database."""
    supplier = db.get(StagedSupplier, supplier_id)
    if not supplier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Staged supplier {supplier_id} not found",
        )

    if supplier.status != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Supplier is {supplier.status}, cannot promote",
        )

    # Check not already unified
    already = _get_already_unified_ids(db)
    if supplier_id in already:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Supplier already exists in unified database",
        )

    # Get source name
    source = db.get(DataSource, supplier.data_source_id)
    source_name = source.name if source else "Unknown"

    now = datetime.now(timezone.utc).isoformat()

    # Build provenance — all fields from single source
    provenance = {}
    from app.services.merge import CANONICAL_FIELDS

    for field, label in CANONICAL_FIELDS:
        val = getattr(supplier, field, None)
        if val is not None:
            val = str(val).strip()
            if not val:
                val = None
        provenance[field] = {
            "value": val,
            "source_entity": source_name,
            "source_record_id": supplier.id,
            "auto": True,
            "chosen_by": current_user.username,
            "chosen_at": now,
        }

    if not supplier.name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Supplier has no name, cannot promote",
        )

    unified = UnifiedSupplier(
        name=supplier.name,
        source_code=supplier.source_code,
        short_name=supplier.short_name,
        currency=supplier.currency,
        payment_terms=supplier.payment_terms,
        contact_name=supplier.contact_name,
        supplier_type=supplier.supplier_type,
        provenance=provenance,
        source_supplier_ids=[supplier.id],
        match_candidate_id=None,  # singleton — no match candidate
        created_by=current_user.username,
    )

    db.add(unified)

    log_action(
        db,
        user_id=None,
        action="singleton_promoted",
        entity_type="unified_supplier",
        entity_id=None,  # Will update after flush
        details={
            "staged_supplier_id": supplier.id,
            "supplier_name": supplier.name,
            "source": source_name,
        },
    )

    db.flush()

    # Update audit entry with the new unified ID
    latest_audit = (
        db.query(AuditLog)
        .filter(AuditLog.action == "singleton_promoted")
        .order_by(AuditLog.id.desc())
        .first()
    )
    if latest_audit:
        latest_audit.entity_id = unified.id

    db.commit()

    return PromoteResponse(
        unified_supplier_id=unified.id,
        supplier_name=supplier.name,
        message=f"Promoted '{supplier.name}' to unified database",
    )


@router.post("/singletons/bulk-promote", response_model=BulkPromoteResponse)
def bulk_promote_singletons(
    body: BulkPromoteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Promote multiple singletons at once."""
    from app.services.merge import CANONICAL_FIELDS

    already = _get_already_unified_ids(db)
    now = datetime.now(timezone.utc).isoformat()

    promoted_ids = []

    for sid in body.supplier_ids:
        supplier = db.get(StagedSupplier, sid)
        if not supplier or supplier.status != "active" or sid in already:
            continue
        if not supplier.name:
            continue

        source = db.get(DataSource, supplier.data_source_id)
        source_name = source.name if source else "Unknown"

        provenance = {}
        for field, label in CANONICAL_FIELDS:
            val = getattr(supplier, field, None)
            if val is not None:
                val = str(val).strip()
                if not val:
                    val = None
            provenance[field] = {
                "value": val,
                "source_entity": source_name,
                "source_record_id": supplier.id,
                "auto": True,
                "chosen_by": current_user.username,
                "chosen_at": now,
            }

        unified = UnifiedSupplier(
            name=supplier.name,
            source_code=supplier.source_code,
            short_name=supplier.short_name,
            currency=supplier.currency,
            payment_terms=supplier.payment_terms,
            contact_name=supplier.contact_name,
            supplier_type=supplier.supplier_type,
            provenance=provenance,
            source_supplier_ids=[supplier.id],
            match_candidate_id=None,
            created_by=current_user.username,
        )
        db.add(unified)
        db.flush()
        promoted_ids.append(unified.id)

        log_action(
            db,
            user_id=None,
            action="singleton_promoted",
            entity_type="unified_supplier",
            entity_id=unified.id,
            details={
                "staged_supplier_id": supplier.id,
                "supplier_name": supplier.name,
                "source": source_name,
                "bulk": True,
            },
        )
        already.add(sid)

    db.commit()

    return BulkPromoteResponse(
        promoted_count=len(promoted_ids),
        unified_supplier_ids=promoted_ids,
    )


# ── Export ──


@router.get("/export")
def export_unified_csv(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export unified suppliers as CSV with provenance metadata."""
    suppliers = db.query(UnifiedSupplier).order_by(UnifiedSupplier.name).all()

    output = io.StringIO()
    writer = csv.writer(output)

    # Header row
    writer.writerow([
        "ID",
        "Name",
        "Supplier Code",
        "Short Name",
        "Currency",
        "Payment Terms",
        "Contact Name",
        "Supplier Type",
        "Source Count",
        "Is Singleton",
        "Created By",
        "Created At",
        # Provenance columns
        "Name Source",
        "Code Source",
        "Short Name Source",
        "Currency Source",
        "Payment Terms Source",
        "Contact Source",
        "Type Source",
    ])

    from app.services.merge import CANONICAL_FIELDS

    field_order = [f[0] for f in CANONICAL_FIELDS]

    for s in suppliers:
        prov = s.provenance or {}
        source_cols = []
        for field in field_order:
            fp = prov.get(field, {})
            if isinstance(fp, dict):
                entity = fp.get("source_entity", "")
                auto = fp.get("auto", False)
                source_cols.append(f"{entity} ({'auto' if auto else 'manual'})")
            else:
                source_cols.append("")

        source_ids = s.source_supplier_ids or []
        writer.writerow([
            s.id,
            s.name,
            s.source_code or "",
            s.short_name or "",
            s.currency or "",
            s.payment_terms or "",
            s.contact_name or "",
            s.supplier_type or "",
            len(source_ids),
            "Yes" if s.match_candidate_id is None else "No",
            s.created_by,
            s.created_at.isoformat() if s.created_at else "",
            *source_cols,
        ])

    output.seek(0)

    log_action(
        db,
        user_id=None,
        action="unified_exported",
        entity_type="unified_supplier",
        entity_id=None,
        details={"count": len(suppliers), "format": "csv", "exported_by": current_user.username},
    )
    db.commit()

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=unified_suppliers_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"
        },
    )


# ── Dashboard ──


@router.get("/dashboard", response_model=DashboardResponse)
def get_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Dashboard with upload stats, match stats, review progress, and recent activity."""
    # Upload stats
    batch_counts = (
        db.query(
            func.count(ImportBatch.id).label("total"),
            func.count(case((ImportBatch.status == "completed", 1))).label("completed"),
            func.count(case((ImportBatch.status == "failed", 1))).label("failed"),
        )
        .one()
    )
    total_staged = db.query(func.count(StagedSupplier.id)).filter(
        StagedSupplier.status == "active"
    ).scalar() or 0

    # Match stats
    total_candidates = db.query(func.count(MatchCandidate.id)).scalar() or 0
    total_groups = db.query(func.count(MatchGroup.id)).scalar() or 0
    avg_confidence = db.query(func.avg(MatchCandidate.confidence)).scalar()

    # Review progress
    review_counts = (
        db.query(
            func.count(case((MatchCandidate.status == "pending", 1))).label("pending"),
            func.count(case((MatchCandidate.status == "confirmed", 1))).label("confirmed"),
            func.count(case((MatchCandidate.status == "rejected", 1))).label("rejected"),
            func.count(case((MatchCandidate.status == "skipped", 1))).label("skipped"),
        )
        .one()
    )

    # Unified stats
    total_unified = db.query(func.count(UnifiedSupplier.id)).scalar() or 0
    merged_count = (
        db.query(func.count(UnifiedSupplier.id))
        .filter(UnifiedSupplier.match_candidate_id.isnot(None))
        .scalar() or 0
    )
    singleton_count = (
        db.query(func.count(UnifiedSupplier.id))
        .filter(UnifiedSupplier.match_candidate_id.is_(None))
        .scalar() or 0
    )

    # Recent activity (last 20 audit entries)
    recent = (
        db.query(AuditLog)
        .order_by(AuditLog.created_at.desc())
        .limit(20)
        .all()
    )

    return DashboardResponse(
        uploads=UploadStats(
            total_batches=batch_counts.total,
            completed=batch_counts.completed,
            failed=batch_counts.failed,
            total_staged=total_staged,
        ),
        matching=MatchStats(
            total_candidates=total_candidates,
            total_groups=total_groups,
            avg_confidence=round(avg_confidence, 3) if avg_confidence else None,
        ),
        review=ReviewProgress(
            pending=review_counts.pending,
            confirmed=review_counts.confirmed,
            rejected=review_counts.rejected,
            skipped=review_counts.skipped,
        ),
        unified=UnifiedStats(
            total_unified=total_unified,
            merged=merged_count,
            singletons=singleton_count,
        ),
        recent_activity=[
            RecentActivity(
                id=e.id,
                action=e.action,
                entity_type=e.entity_type,
                entity_id=e.entity_id,
                details=e.details,
                created_at=e.created_at,
            )
            for e in recent
        ],
    )
