"""Celery task for running a MatchRun end-to-end."""

import logging
from contextlib import suppress
from datetime import UTC, datetime

from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.database import get_task_session
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(
    bind=True,
    name="run_match",
    max_retries=2,
    autoretry_for=(OperationalError, ConnectionError),
    retry_backoff=True,
    retry_backoff_max=120,
    retry_jitter=True,
)
def run_match(self, match_run_id: int):
    with get_task_session() as db:
        from app.models.match_run import MatchRun
        from app.services.matching import run_matching_pipeline
        from app.services.record_set import RecordSet

        run = db.query(MatchRun).filter(MatchRun.id == match_run_id).one()

        if run.status not in ("pending",):
            logger.info("run %d already in status %s; skipping", run.id, run.status)
            return {"status": run.status}

        # Per-type advisory lock — derived deterministically from the type key.
        lock_key = abs(hash(run.type)) % (2**31)
        with suppress(Exception):  # SQLite tests: skip lock acquisition.
            db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": lock_key})

        run.status = "running"
        run.started_at = datetime.now(UTC)
        db.commit()

        def progress(stage: str, pct: int) -> None:
            self.update_state(state=stage.upper(), meta={"stage": stage, "progress": pct})

        try:
            batch_ids = [b.id for b in run.batches]
            if run.mode == "FILE_VS_FILE":
                side_a = RecordSet.from_batch(db, batch_ids[0])
                side_b = RecordSet.from_batch(db, batch_ids[1])
            elif run.mode == "FILE_VS_GOLDEN":
                side_a = RecordSet.from_batch(db, batch_ids[0])
                side_b = RecordSet.from_unified(db, run.type)
            elif run.mode == "MULTI_FILE":
                side_a = RecordSet.from_batches(db, batch_ids)
                side_b = None
            else:
                raise ValueError(f"unknown mode {run.mode!r}")

            stats = run_matching_pipeline(db, run.id, side_a, side_b, progress_callback=progress)
            run.stats = stats
            run.status = "completed"
            run.finished_at = datetime.now(UTC)
            db.commit()

            # Broadcast completion via websocket (best-effort; failures don't fail the run).
            try:
                from app.services.notifications import publish_notification

                publish_notification(
                    "match_complete",
                    {"run_id": run.id, "type": run.type, "stats": stats},
                )
            except Exception as e:
                logger.warning("notification failed: %s", e)

            return {"status": "completed", "stats": stats}
        except Exception as e:
            db.rollback()
            run.status = "failed"
            run.error_message = str(e)
            run.finished_at = datetime.now(UTC)
            db.commit()
            raise
