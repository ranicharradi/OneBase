"""Dynamic ``v_unified_records_for_ask`` view rebuilder.

The Ask feature (``/api/ask``) translates user questions into SQL against a
read-only Postgres view that exposes unified records as flat columns. The
initial Alembic migration created the view with a hardcoded list of supplier
fields, which prevents Ask from querying other record types.

This module rebuilds the view from the current ``app.record_types`` registry
so any registered type's fields are queryable. Called from ``main.lifespan``
on startup. No-op on non-Postgres dialects (SQLite tests, etc.).
"""

import logging
from collections import OrderedDict

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.record_types import all_types

logger = logging.getLogger(__name__)

VIEW_NAME = "v_unified_records_for_ask"


def _collect_field_keys() -> list[str]:
    """Return the union of FieldDef.keys across all registered record types,
    in registration order with within-type field order preserved.

    Two different types declaring the same key collapse to one column — the
    LLM-emitted SQL doesn't know which type a key came from, so reusing
    column names is acceptable here.
    """
    keys: OrderedDict[str, None] = OrderedDict()
    for rt in all_types():
        for f in rt.fields:
            keys.setdefault(f.key, None)
    return list(keys.keys())


def refresh_ask_view(db: Session) -> None:
    """Drop and recreate v_unified_records_for_ask from registered record types.

    Skipped on non-Postgres dialects (the view itself is Postgres-only).
    """
    bind = db.bind
    if bind is None or bind.dialect.name != "postgresql":
        return

    field_keys = _collect_field_keys()
    # `DROP VIEW IF EXISTS` first so the column list can shrink between
    # restarts (CREATE OR REPLACE refuses to drop columns).
    db.execute(text(f"DROP VIEW IF EXISTS {VIEW_NAME}"))

    json_cols = ",\n          ".join(f"(u.fields ->> '{key}') AS {key}" for key in field_keys)
    json_block = f",\n          {json_cols}" if json_cols else ""
    sql = f"""
        CREATE VIEW {VIEW_NAME} AS
        SELECT
          u.id,
          u.type AS record_type,
          ds.name AS source_name,
          u.created_at,
          u.dq_completeness,
          u.dq_validity,
          u.dq_score{json_block}
        FROM unified_records u
        LEFT JOIN LATERAL (
          SELECT sr.data_source_id
          FROM staged_records sr
          WHERE sr.id::text = (u.source_record_ids->>0)
          LIMIT 1
        ) first_src ON TRUE
        LEFT JOIN data_sources ds ON ds.id = first_src.data_source_id
    """  # noqa: S608 — column list comes from registered RecordType.FieldDef.key, not user input
    db.execute(text(sql))
    db.commit()
    logger.info("Refreshed %s with %d field column(s)", VIEW_NAME, len(field_keys))
