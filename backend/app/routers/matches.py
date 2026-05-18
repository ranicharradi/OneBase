"""MatchRun API."""

from itertools import combinations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.dependencies import Pagination, get_current_user, get_db, get_pagination, require_role
from app.models.batch import ImportBatch
from app.models.enums import BatchStatus, UserRole
from app.models.match import MatchCandidate
from app.models.match_run import MatchRun
from app.models.user import User
from app.schemas.match import (
    BatchSummary,
    MatchRunCreate,
    MatchRunDetail,
    MatchRunDispatchResponse,
    MatchRunResponse,
    SourceSummary,
)
from app.services.match import (
    MatchConflictError,
    MatchNotFoundError,
    MatchValidationError,
    create_run,
)
from app.tasks.match import run_match

router = APIRouter(prefix="/api/matches", tags=["matches"])


def _resolve_source_to_current_batch(db: Session, source_id: int) -> ImportBatch:
    batch = (
        db.query(ImportBatch)
        .filter(
            ImportBatch.data_source_id == source_id,
            ImportBatch.status == BatchStatus.COMPLETED,
        )
        .order_by(ImportBatch.created_at.desc())
        .first()
    )
    if batch is None:
        raise MatchNotFoundError(f"Source {source_id} has no completed batch yet")
    return batch


def _to_response(run: MatchRun) -> MatchRunResponse:
    sources: list[SourceSummary] = []
    seen: set[int] = set()
    for b in run.batches:
        if b.data_source_id in seen:
            continue
        seen.add(b.data_source_id)
        sources.append(SourceSummary(id=b.data_source_id, name=b.data_source.name))
    return MatchRunResponse(
        id=run.id,
        type=run.type,
        mode=run.mode,
        status=run.status,
        name=run.name,
        created_by=run.created_by,
        created_at=run.created_at,
        started_at=run.started_at,
        finished_at=run.finished_at,
        task_id=run.task_id,
        stats=run.stats or {},
        batch_ids=[b.id for b in run.batches],
        batches=[
            BatchSummary(
                id=b.id,
                data_source_id=b.data_source_id,
                data_source_name=b.data_source.name,
                original_filename=b.original_filename,
                file_extension=b.file_extension,
            )
            for b in run.batches
        ],
        sources=sources,
        error_message=run.error_message,
    )


def _derive_run_name(db: Session, run: MatchRun) -> str:
    names: list[str] = []
    seen: set[int] = set()
    for b in run.batches:
        if b.data_source_id in seen:
            continue
        seen.add(b.data_source_id)
        names.append(b.data_source.name)
    if run.mode == "FILE_VS_GOLDEN":
        return f"{names[0]} × Golden"
    return " × ".join(names)


@router.post("", response_model=MatchRunDispatchResponse, status_code=status.HTTP_201_CREATED)
def post_runs(
    payload: MatchRunCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    if payload.source_ids:
        file_ids = [_resolve_source_to_current_batch(db, sid).id for sid in payload.source_ids]
    else:
        file_ids = list(payload.file_ids)
    if len(file_ids) == 1:
        dispatch_plan = [("FILE_VS_GOLDEN", file_ids)]
    else:
        dispatch_plan = [("FILE_VS_FILE", list(pair)) for pair in combinations(sorted(file_ids), 2)]

    runs = []
    try:
        for mode, batch_ids in dispatch_plan:
            run = create_run(
                db,
                type=payload.type,
                mode=mode,
                batch_ids=batch_ids,
                name=None,
                username=current_user.username,
            )
            run.name = _derive_run_name(db, run)
            runs.append(run)
    except MatchNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except MatchConflictError as e:
        raise HTTPException(
            status_code=409,
            detail=str(e),
            headers={"X-Conflict-Run-Id": str(e.run_id)},
        ) from e
    except MatchValidationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    db.commit()
    for run in runs:
        task = run_match.delay(run.id)
        run.task_id = task.id
    db.commit()
    return MatchRunDispatchResponse(runs=[_to_response(r) for r in runs])


@router.get("", response_model=list[MatchRunResponse])
def list_runs(
    type: str | None = Query(None),
    mode: str | None = Query(None),
    run_status: str | None = Query(None, alias="status"),
    pagination: Pagination = Depends(get_pagination),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(MatchRun)
    if type is not None:
        q = q.filter(MatchRun.type == type)
    if mode is not None:
        q = q.filter(MatchRun.mode == mode)
    if run_status is not None:
        q = q.filter(MatchRun.status == run_status)
    runs = q.order_by(MatchRun.created_at.desc()).offset(pagination.offset).limit(pagination.limit).all()
    return [_to_response(r) for r in runs]


@router.get("/{run_id}", response_model=MatchRunDetail)
def get_run(
    run_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    run = db.query(MatchRun).filter(MatchRun.id == run_id).first()
    if run is None:
        raise HTTPException(404, "Run not found")
    rows = db.query(MatchCandidate.status, MatchCandidate.id).filter(MatchCandidate.match_run_id == run_id).all()
    counts: dict[str, int] = {}
    for s, _ in rows:
        counts[s] = counts.get(s, 0) + 1
    base = _to_response(run).model_dump()
    return MatchRunDetail(**base, candidate_counts=counts)


@router.get("/{run_id}/status")
def get_run_status(
    run_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    run = db.query(MatchRun).filter(MatchRun.id == run_id).first()
    if run is None:
        raise HTTPException(404, "Run not found")
    if not run.task_id:
        return {"task_id": None, "state": run.status.upper(), "stage": None, "progress": None, "detail": None}
    from app.tasks.celery_app import celery_app

    result = celery_app.AsyncResult(run.task_id)
    info = result.info or {}
    if isinstance(info, dict):
        stage = info.get("stage")
        progress = info.get("progress")
        detail = info.get("detail")
    else:
        stage = None
        progress = None
        detail = str(info) if info else None
    state = result.state
    if state == "SUCCESS":
        state = "COMPLETE"
    return {"task_id": run.task_id, "state": state, "stage": stage, "progress": progress, "detail": detail}


@router.delete("/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_run(
    run_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    run = db.query(MatchRun).filter(MatchRun.id == run_id).first()
    if run is None:
        raise HTTPException(404, "Run not found")
    if run.status not in ("pending", "failed", "stale"):
        raise HTTPException(409, f"Cannot delete run in status {run.status!r}")
    db.query(MatchCandidate).filter(MatchCandidate.match_run_id == run_id).delete()
    db.delete(run)
    db.commit()
