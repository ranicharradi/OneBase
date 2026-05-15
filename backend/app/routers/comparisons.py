"""ComparisonRun API."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.dependencies import Pagination, get_current_user, get_db, get_pagination, require_role
from app.models.comparison import ComparisonRun
from app.models.enums import UserRole
from app.models.match import MatchCandidate
from app.models.user import User
from app.schemas.comparison import (
    BatchSummary,
    ComparisonRunCreate,
    ComparisonRunDetail,
    ComparisonRunResponse,
)
from app.services.comparison import (
    ComparisonConflictError,
    ComparisonNotFoundError,
    ComparisonValidationError,
    create_run,
)
from app.tasks.comparison import run_comparison

router = APIRouter(prefix="/api/comparisons", tags=["comparisons"])


def _to_response(run: ComparisonRun) -> ComparisonRunResponse:
    return ComparisonRunResponse(
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
        batches=[BatchSummary(id=b.id, filename=b.filename) for b in run.batches],
        error_message=run.error_message,
    )


@router.post("/", response_model=ComparisonRunResponse, status_code=status.HTTP_201_CREATED)
def post_run(
    payload: ComparisonRunCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    try:
        run = create_run(
            db,
            type=payload.type,
            mode=payload.mode,
            batch_ids=payload.batch_ids,
            name=payload.name,
            username=current_user.username,
        )
    except ComparisonNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ComparisonConflictError as e:
        raise HTTPException(
            status_code=409,
            detail=str(e),
            headers={"X-Conflict-Run-Id": str(e.run_id)},
        ) from e
    except ComparisonValidationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    db.commit()
    task = run_comparison.delay(run.id)
    run.task_id = task.id
    db.commit()
    return _to_response(run)


@router.get("/", response_model=list[ComparisonRunResponse])
def list_runs(
    type: str | None = Query(None),
    mode: str | None = Query(None),
    run_status: str | None = Query(None, alias="status"),
    pagination: Pagination = Depends(get_pagination),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(ComparisonRun)
    if type is not None:
        q = q.filter(ComparisonRun.type == type)
    if mode is not None:
        q = q.filter(ComparisonRun.mode == mode)
    if run_status is not None:
        q = q.filter(ComparisonRun.status == run_status)
    runs = q.order_by(ComparisonRun.created_at.desc()).offset(pagination.offset).limit(pagination.limit).all()
    return [_to_response(r) for r in runs]


@router.get("/{run_id}", response_model=ComparisonRunDetail)
def get_run(
    run_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    run = db.query(ComparisonRun).filter(ComparisonRun.id == run_id).first()
    if run is None:
        raise HTTPException(404, "Run not found")
    rows = db.query(MatchCandidate.status, MatchCandidate.id).filter(MatchCandidate.comparison_run_id == run_id).all()
    counts: dict[str, int] = {}
    for s, _ in rows:
        counts[s] = counts.get(s, 0) + 1
    base = _to_response(run).model_dump()
    return ComparisonRunDetail(**base, candidate_counts=counts)


@router.get("/{run_id}/status")
def get_run_status(
    run_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    run = db.query(ComparisonRun).filter(ComparisonRun.id == run_id).first()
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
    run = db.query(ComparisonRun).filter(ComparisonRun.id == run_id).first()
    if run is None:
        raise HTTPException(404, "Run not found")
    if run.status not in ("pending", "failed", "stale"):
        raise HTTPException(409, f"Cannot delete run in status {run.status!r}")
    db.query(MatchCandidate).filter(MatchCandidate.comparison_run_id == run_id).delete()
    db.delete(run)
    db.commit()
