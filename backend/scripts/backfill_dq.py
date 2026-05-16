"""Backfill dq_completeness / dq_validity / dq_score on existing UnifiedRecords.

Usage:
    python -m scripts.backfill_dq
"""

from app.database import SessionLocal
from app.models.unified import UnifiedRecord
from app.record_types import get as get_record_type
from app.services.dq import compute_dq


def main() -> None:
    db = SessionLocal()
    try:
        records = db.query(UnifiedRecord).all()
        updated = 0
        skipped = 0
        for r in records:
            try:
                rt = get_record_type(r.type)
            except KeyError:
                skipped += 1
                continue
            completeness, validity, score = compute_dq(r, rt.fields)
            r.dq_completeness = completeness
            r.dq_validity = validity
            r.dq_score = score
            updated += 1
        db.commit()
        print(f"Updated {updated} records, skipped {skipped} (unknown record type).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
