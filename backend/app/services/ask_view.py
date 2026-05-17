"""Maintains the v_unified_records_for_ask Postgres view.

The view flattens UnifiedRecord.fields JSONB into one column per registered
field key, so the /api/ask LLM-to-SQL flow can query named columns. It's
recreated on each app startup from the live `app.record_types` registry, so
adding or removing a RecordType updates the view automatically — no manual
Alembic step required.
"""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.record_types import all_types

logger = logging.getLogger(__name__)

VIEW_NAME = "v_unified_records_for_ask"


def refresh_ask_view(db: Session) -> None:
    """Create or replace the ask view from currently-registered record types.

    No-op on non-PostgreSQL dialects (SQLite tests don't use the view).
    """
    bind = db.get_bind()
    if bind.dialect.name != "postgresql":
        return

    keys: list[str] = sorted({fdef.key for rt in all_types() for fdef in rt.fields})

    if not keys:
        db.execute(text(f"DROP VIEW IF EXISTS {VIEW_NAME}"))
        return

    json_cols = ",\n          ".join(f"(u.fields ->> '{key}') AS {key}" for key in keys)
    sql = f"""
        CREATE OR REPLACE VIEW {VIEW_NAME} AS
        SELECT
          u.id,
          u.type AS record_type,
          ds.name AS source_name,
          u.created_at,
          u.dq_completeness,
          u.dq_validity,
          u.dq_score,
          {json_cols}
        FROM unified_records u
        LEFT JOIN LATERAL (
          SELECT sr.data_source_id
          FROM staged_records sr
          WHERE sr.id::text = (u.source_record_ids->>0)
          LIMIT 1
        ) first_src ON TRUE
        LEFT JOIN data_sources ds ON ds.id = first_src.data_source_id
    """  # noqa: S608 — `keys` come from a closed in-process registry, not user input
    db.execute(text(sql))
    logger.info("refreshed %s with %d field columns", VIEW_NAME, len(keys))
