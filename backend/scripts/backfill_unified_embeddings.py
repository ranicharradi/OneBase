"""One-shot: populate normalized_name + name_embedding on existing UnifiedRecords.

Idempotent: skips rows where both fields are already populated.
Run: `cd backend && ENV_PROFILE=dev python3 scripts/backfill_unified_embeddings.py`
"""

import logging
import sys

from app.database import SessionLocal
from app.models.unified import UnifiedRecord
from app.services.embedding import compute_embeddings
from app.services.normalization import normalize_name

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def main() -> int:
    db = SessionLocal()
    try:
        rows = db.query(UnifiedRecord).all()
        updated = 0
        names_to_embed = []
        rows_to_update = []

        for r in rows:
            if r.normalized_name and r.name_embedding is not None:
                continue
            if not r.name:
                continue
            r.normalized_name = normalize_name(r.name)
            names_to_embed.append(r.name)
            rows_to_update.append(r)
            updated += 1

        if names_to_embed:
            embeddings = compute_embeddings(names_to_embed)
            for i, r in enumerate(rows_to_update):
                r.name_embedding = embeddings[i]

        db.commit()
        logger.info("Backfilled %d / %d unified records", updated, len(rows))
        return 0
    except Exception as e:
        logger.error("Backfill failed: %s", e)
        db.rollback()
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
