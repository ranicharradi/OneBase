"""Match run orchestration: validate, create, mark-stale.

Domain errors below intentionally subclass ValueError instead of HTTPException so
the service stays transport-agnostic; the router translates each to a status code.
"""

from sqlalchemy.orm import Session

from app.models.batch import ImportBatch
from app.models.match import MatchCandidate
from app.models.match_run import MatchRun
from app.models.unified import UnifiedRecord
from app.record_types import get as get_record_type

MIN_BATCHES_BY_MODE = {"FILE_VS_FILE": 2, "FILE_VS_GOLDEN": 1}
MAX_BATCHES_BY_MODE = {"FILE_VS_FILE": 2, "FILE_VS_GOLDEN": 1}


class MatchValidationError(ValueError):
    pass


class MatchNotFoundError(ValueError):
    pass


class MatchConflictError(ValueError):
    def __init__(self, message: str, run_id: int) -> None:
        super().__init__(message)
        self.run_id = run_id


def create_run(
    db: Session,
    *,
    type: str,
    mode: str,
    batch_ids: list[int],
    name: str | None,
    username: str,
) -> MatchRun:
    try:
        get_record_type(type)
    except KeyError:
        raise MatchNotFoundError(f"Unknown record type: {type!r}") from None

    if mode not in MIN_BATCHES_BY_MODE:
        raise MatchValidationError(f"Unknown mode: {mode!r}")

    min_n = MIN_BATCHES_BY_MODE[mode]
    max_n = MAX_BATCHES_BY_MODE[mode]
    if len(batch_ids) < min_n or (max_n is not None and len(batch_ids) > max_n):
        expected = f"{min_n}" if max_n == min_n else f"{min_n}+"
        raise MatchValidationError(f"Mode {mode} requires {expected} files; received {len(batch_ids)}")

    batches = db.query(ImportBatch).filter(ImportBatch.id.in_(batch_ids)).all()
    if len(batches) != len(batch_ids):
        raise MatchValidationError("One or more file IDs not found")

    types = {b.data_source.type for b in batches}
    if types != {type}:
        raise MatchValidationError(f"Files must all be of type {type!r}; got {types!r}")

    if mode == "FILE_VS_GOLDEN":
        unified_count = db.query(UnifiedRecord).filter(UnifiedRecord.type == type).count()
        if unified_count == 0:
            raise MatchValidationError("No golden records yet — run a FILE_VS_FILE comparison first to produce them.")

    conflict = db.query(MatchRun).filter(MatchRun.type == type, MatchRun.status == "running").first()
    if conflict is not None:
        raise MatchConflictError(
            f"A run of type {type!r} is already running (run #{conflict.id})",
            run_id=conflict.id,
        )

    run = MatchRun(type=type, mode=mode, status="pending", name=name, created_by=username)
    run.batches = batches
    db.add(run)
    db.flush()
    return run


def mark_stale_for_source(db: Session, data_source_id: int) -> int:
    """Mark every non-stale run that references batches of this source as stale.

    Returns number of runs marked.
    """
    runs = (
        db.query(MatchRun)
        .join(MatchRun.batches)
        .filter(ImportBatch.data_source_id == data_source_id)
        .filter(MatchRun.status.in_(["pending", "running", "completed"]))
        .distinct()
        .all()
    )
    n = 0
    for run in runs:
        run.status = "stale"
        db.query(MatchCandidate).filter(
            MatchCandidate.match_run_id == run.id,
            MatchCandidate.status == "pending",
        ).update({"status": "invalidated"}, synchronize_session=False)
        n += 1
    return n
