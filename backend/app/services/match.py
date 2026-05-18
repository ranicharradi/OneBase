"""Match run orchestration: validate, create.

Domain errors below intentionally subclass ValueError instead of HTTPException so
the service stays transport-agnostic; the router translates each to a status code.
"""

from sqlalchemy.orm import Session

from app.models.match_run import MatchRun
from app.models.source import DataSource
from app.models.unified import UnifiedRecord
from app.record_types import get as get_record_type

MIN_SOURCES_BY_MODE = {"FILE_VS_FILE": 2, "FILE_VS_GOLDEN": 1}
MAX_SOURCES_BY_MODE = {"FILE_VS_FILE": 2, "FILE_VS_GOLDEN": 1}


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
    source_ids: list[int],
    name: str | None,
    username: str,
) -> MatchRun:
    try:
        get_record_type(type)
    except KeyError:
        raise MatchNotFoundError(f"Unknown record type: {type!r}") from None

    if mode not in MIN_SOURCES_BY_MODE:
        raise MatchValidationError(f"Unknown mode: {mode!r}")

    min_n = MIN_SOURCES_BY_MODE[mode]
    max_n = MAX_SOURCES_BY_MODE[mode]
    if len(source_ids) < min_n or (max_n is not None and len(source_ids) > max_n):
        expected = f"{min_n}" if max_n == min_n else f"{min_n}+"
        raise MatchValidationError(f"Mode {mode} requires {expected} sources; received {len(source_ids)}")

    sources = db.query(DataSource).filter(DataSource.id.in_(source_ids)).all()
    if len(sources) != len(source_ids):
        raise MatchValidationError("One or more source IDs not found")

    types = {s.type for s in sources}
    if types != {type}:
        raise MatchValidationError(f"Sources must all be of type {type!r}; got {types!r}")

    if mode == "FILE_VS_GOLDEN":
        unified_count = db.query(UnifiedRecord).filter(UnifiedRecord.type == type).count()
        if unified_count == 0:
            raise MatchValidationError("No golden records yet — run a FILE_VS_FILE match first to produce them.")

    conflict = db.query(MatchRun).filter(MatchRun.type == type, MatchRun.status == "running").first()
    if conflict is not None:
        raise MatchConflictError(
            f"A run of type {type!r} is already running (run #{conflict.id})",
            run_id=conflict.id,
        )

    run = MatchRun(type=type, mode=mode, status="pending", name=name, created_by=username)
    run.sources = sources
    db.add(run)
    db.flush()
    return run
