"""Celery task for processing uploaded CSV files."""

import logging
import os

from sqlalchemy.exc import OperationalError

from app.database import SessionLocal
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
    db = SessionLocal()
    try:
        from app.models.batch import ImportBatch
        from app.models.enums import BatchStatus
        from app.services.ingestion import run_ingestion

        batch = db.query(ImportBatch).filter(ImportBatch.id == batch_id).one()

        # Idempotency guard: skip if already completed or processing
        if batch.status in (BatchStatus.COMPLETED, BatchStatus.PROCESSING):
            logger.info("Batch %d already %s, skipping", batch_id, batch.status)
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

        # Run ingestion pipeline
        row_count = run_ingestion(db, batch_id, file_content, progress_callback)
        db.commit()

        # Enqueue matching — detect re-upload by checking for prior active suppliers
        # Check if there are superseded suppliers for this data source
        # from a prior batch — indicates a re-upload scenario.
        # (Ingestion already marks old records as "superseded", so checking
        # "active" would always return 0 here.)
        from app.models.enums import SupplierStatus
        from app.models.staging import StagedSupplier
        from app.tasks.matching import run_matching

        prior_superseded_count = (
            db.query(StagedSupplier)
            .filter(
                StagedSupplier.data_source_id == batch.data_source_id,
                StagedSupplier.import_batch_id != batch.id,
                StagedSupplier.status == SupplierStatus.SUPERSEDED,
            )
            .count()
        )

        if prior_superseded_count > 0:
            # Re-upload: invalidate old candidates for this source
            matching_task = run_matching.delay(batch_id, invalidate_source_id=batch.data_source_id)
        else:
            matching_task = run_matching.delay(batch_id)

        batch.matching_task_id = matching_task.id
        db.commit()  # Persist matching_task_id so status endpoint can track matching

        logger.info("Ingestion complete for batch %d: %d rows", batch_id, row_count)
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
    finally:
        db.close()
