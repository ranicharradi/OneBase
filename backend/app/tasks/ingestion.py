"""Celery task for processing uploaded CSV files."""

import logging
import os

from sqlalchemy.exc import OperationalError

from app.database import get_task_session
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(
    bind=True,
    name="process_upload",
    max_retries=3,
    autoretry_for=(OperationalError, ConnectionError),
    retry_backoff=True,
    retry_backoff_max=120,
    retry_jitter=True,
)
def process_upload(self, batch_id: int):
    """Process an uploaded CSV file through the full ingestion pipeline.

    Creates its own database session (Celery tasks manage their own sessions).
    Reports progress via self.update_state().
    Enqueues matching stub on success.
    """
    with get_task_session() as db:
        try:
            from app.models.batch import ImportBatch
            from app.models.enums import BatchStatus
            from app.services.ingestion import run_ingestion

            batch = db.query(ImportBatch).filter(ImportBatch.id == batch_id).one()

            # Idempotency guard: return early if already completed or processing
            if batch.status in (BatchStatus.COMPLETED, BatchStatus.PROCESSING):
                logger.info("Batch %d already %s, ignoring", batch_id, batch.status)
                return {"status": batch.status, "batch_id": batch_id}

            # Mark as processing before starting work
            batch.status = BatchStatus.PROCESSING
            db.commit()

            # Read file from disk
            filepath = os.path.join("data", "uploads", batch.filename)
            with open(filepath, "rb") as f:
                file_content = f.read()

            # Define progress callback
            def progress_callback(stage: str, pct: int):
                self.update_state(
                    state=stage.upper(),
                    meta={"stage": stage, "progress": pct},
                )

            # Detect re-upload before ingestion so we can mark runs stale afterward.
            from app.models.enums import RecordStatus
            from app.models.staging import StagedRecord

            is_reupload = (
                db.query(StagedRecord)
                .filter(
                    StagedRecord.data_source_id == batch.data_source_id,
                    StagedRecord.status == RecordStatus.ACTIVE,
                )
                .count()
            ) > 0

            # Run ingestion pipeline
            row_count = run_ingestion(db, batch_id, file_content, progress_callback)
            db.commit()

            if is_reupload:
                from app.services.comparison import mark_stale_for_source

                mark_stale_for_source(db, batch.data_source_id)
                db.commit()

            logger.info(
                "Ingestion complete for batch %d: %d rows",
                batch_id,
                row_count,
            )
            return {"status": "completed", "batch_id": batch_id, "row_count": row_count}

        except Exception as e:
            db.rollback()
            logger.error("Ingestion failed for batch %d: %s", batch_id, e)
            # Clean up orphaned file and mark batch as failed
            try:
                from app.models.batch import ImportBatch
                from app.models.enums import BatchStatus

                batch = db.query(ImportBatch).filter(ImportBatch.id == batch_id).one()
                if batch.filename:
                    file_full_path = os.path.join("data", "uploads", batch.filename)
                    if os.path.exists(file_full_path):
                        try:
                            os.unlink(file_full_path)
                            logger.info("Cleaned up file %s for failed batch %d", batch.filename, batch_id)
                        except OSError as cleanup_err:
                            logger.warning("Failed to clean up file: %s", cleanup_err)
                batch.status = BatchStatus.FAILED
                batch.error_message = str(e)
                db.commit()
            except Exception as mark_err:
                logger.error("Failed to mark batch %d as failed: %s", batch_id, mark_err)
            raise
