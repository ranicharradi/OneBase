"""Matching stub task — placeholder for Phase 2 matching engine."""
import logging

from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="run_matching")
def run_matching(batch_id: int):
    """Stub matching task — real matching built in Phase 2.

    This stub is auto-enqueued after ingestion completes to maintain
    the pipeline contract. In Phase 2, it will compute similarity
    scores and create MatchCandidate records.
    """
    logger.info(f"Matching stub for batch {batch_id}")
    return {"status": "stub", "batch_id": batch_id}
