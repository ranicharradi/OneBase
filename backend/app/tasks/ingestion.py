"""Celery task for processing uploaded CSV files."""

import logging
import os

from app.tasks.celery_app import celery_app
from app.database import SessionLocal

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name="process_upload")
def process_upload(self, batch_id: int):
    """Process an uploaded CSV file through the full ingestion pipeline.

    Creates its own database session (Celery tasks manage their own sessions).
    Reports progress via self.update_state().
    Enqueues matching stub on success.
    """
    db = SessionLocal()
    try:
        from app.models.batch import ImportBatch
        from app.services.ingestion import run_ingestion

        batch = db.query(ImportBatch).filter(ImportBatch.id == batch_id).one()

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
        from app.tasks.matching import run_matching
        from app.models.staging import StagedSupplier

        # Check if there are existing active suppliers for this data source
        # from a prior batch (not this one)
        prior_active_count = (
            db.query(StagedSupplier)
            .filter(
                StagedSupplier.data_source_id == batch.data_source_id,
                StagedSupplier.import_batch_id != batch.id,
                StagedSupplier.status == "active",
            )
            .count()
        )

        if prior_active_count > 0:
            # Re-upload: invalidate old candidates for this source
            matching_task = run_matching.delay(
                batch_id, invalidate_source_id=batch.data_source_id
            )
        else:
            matching_task = run_matching.delay(batch_id)

        batch.matching_task_id = matching_task.id

        logger.info("Ingestion complete for batch %d: %d rows", batch_id, row_count)
        return {"status": "completed", "batch_id": batch_id, "row_count": row_count}

    except Exception as e:
        db.rollback()
        logger.error("Ingestion failed for batch %d: %s", batch_id, e)
        # Ensure batch is marked as failed
        try:
            from app.models.batch import ImportBatch

            batch = db.query(ImportBatch).filter(ImportBatch.id == batch_id).one()
            batch.status = "failed"
            batch.error_message = str(e)
            db.commit()
        except Exception as mark_err:
            logger.error("Failed to mark batch %d as failed: %s", batch_id, mark_err)
        raise
    finally:
        db.close()
