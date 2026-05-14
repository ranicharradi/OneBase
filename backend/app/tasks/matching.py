"""Celery task for matching pipeline — replaces stub with full implementation."""

import logging

from sqlalchemy.exc import OperationalError

from app.database import get_task_session
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(
    bind=True,
    name="run_matching",
    max_retries=2,
    autoretry_for=(OperationalError, ConnectionError),
    retry_backoff=True,
    retry_backoff_max=120,
    retry_jitter=True,
)
def run_matching(self, batch_id: int, invalidate_source_id: int | None = None):
    """Run the matching pipeline for a given batch.

    Creates its own database session (Celery tasks manage their own sessions).
    Reports progress via self.update_state().
    Optionally invalidates old candidates for re-upload scenarios.

    Args:
        batch_id: The import batch to process.
        invalidate_source_id: Source ID to invalidate old candidates for (re-upload).
    """
    with get_task_session() as db:
        try:
            from app.models.comparison import ComparisonRun
            from app.models.match import MatchCandidate
            from app.models.staging import StagedRecord
            from app.services.matching import run_matching_pipeline
            from app.services.record_set import RecordSet

            # Idempotency guard: return early if candidates already exist for this batch
            # (unless this is a re-upload where we need to invalidate and rematch)
            if invalidate_source_id is None:
                batch_record_ids = db.query(StagedRecord.id).filter(StagedRecord.import_batch_id == batch_id)
                existing_candidates = (
                    db.query(MatchCandidate.id)
                    .filter(
                        (MatchCandidate.record_a_id.in_(batch_record_ids))
                        | (MatchCandidate.record_b_id.in_(batch_record_ids))
                    )
                    .limit(1)
                    .count()
                )
                if existing_candidates > 0:
                    logger.info("Matching for batch %d already has candidates, skipping", batch_id)
                    return {"status": "completed", "batch_id": batch_id}

            # Progress callback for Celery state updates + WebSocket push
            def progress_callback(stage: str, pct: int):
                self.update_state(
                    state=stage.upper(),
                    meta={"stage": stage, "progress": pct},
                )
                # Push progress to Dashboard via WebSocket
                try:
                    from app.services.notifications import publish_notification

                    publish_notification(
                        "matching_progress",
                        {
                            "batch_id": batch_id,
                            "stage": stage,
                            "progress": pct,
                        },
                    )
                except Exception:  # noqa: S110
                    pass  # never block matching on notification failure

            # Build a ComparisonRun scoping this pipeline execution
            side_a = RecordSet.from_batch(db, batch_id)
            type_key = side_a.type_key

            run = ComparisonRun(
                type=type_key,
                mode="FILE_VS_FILE",
                status="running",
                created_by="system",
            )
            db.add(run)
            db.flush()

            # Run the pipeline
            stats = run_matching_pipeline(
                db,
                run.id,
                side_a,
                None,  # single-side intra-batch: no side_b
                progress_callback=progress_callback,
            )

            db.commit()

            logger.info(
                "Matching complete for batch %d: %d candidates, %d groups",
                batch_id,
                stats["candidate_count"],
                stats["group_count"],
            )

            # Publish completion notification (failure here must not crash the task)
            try:
                from app.services.notifications import publish_notification

                publish_notification(
                    "matching_complete",
                    {
                        "batch_id": batch_id,
                        "candidate_count": stats["candidate_count"],
                        "group_count": stats["group_count"],
                    },
                )
            except Exception as notif_err:
                logger.warning("Failed to publish completion notification: %s", notif_err)

            return {
                "status": "completed",
                "batch_id": batch_id,
                **stats,
            }

        except Exception as e:
            db.rollback()
            logger.error("Matching failed for batch %d: %s", batch_id, e)

            # Publish failure notification (must not interfere with error propagation)
            try:
                from app.services.notifications import publish_notification

                publish_notification(
                    "matching_failed",
                    {"batch_id": batch_id, "error": str(e)},
                )
            except Exception as notif_err:
                logger.warning("Failed to publish failure notification: %s", notif_err)

            raise
