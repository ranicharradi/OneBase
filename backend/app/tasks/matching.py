"""Celery task for matching pipeline — replaces stub with full implementation."""

import logging

from app.tasks.celery_app import celery_app
from app.database import SessionLocal

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name="run_matching")
def run_matching(self, batch_id: int, invalidate_source_id: int | None = None):
    """Run the matching pipeline for a given batch.

    Creates its own database session (Celery tasks manage their own sessions).
    Reports progress via self.update_state().
    Optionally invalidates old candidates for re-upload scenarios.

    Args:
        batch_id: The import batch to process.
        invalidate_source_id: Source ID to invalidate old candidates for (re-upload).
    """
    db = SessionLocal()
    try:
        from app.models.batch import ImportBatch
        from app.services.matching import run_matching_pipeline

        # Store matching task ID on batch
        batch = db.query(ImportBatch).filter(ImportBatch.id == batch_id).one()
        batch.matching_task_id = self.request.id
        db.flush()

        # Progress callback for Celery state updates
        def progress_callback(stage: str, pct: int):
            self.update_state(
                state=stage.upper(),
                meta={"stage": stage, "progress": pct},
            )

        # Run the pipeline
        stats = run_matching_pipeline(
            db,
            batch_id,
            progress_callback=progress_callback,
            invalidate_source_id=invalidate_source_id,
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
    finally:
        db.close()
