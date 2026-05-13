"""ask view

Revision ID: 003_ask_view
Revises: 002_dq_scores
Create Date: 2026-05-13
"""

from alembic import op

revision = "003_ask_view"
down_revision = "002_dq_scores"
branch_labels = None
depends_on = None

# Union of FieldDef.key across registered record types. Update whenever a new key is added.
FIELD_KEYS = [
    "supplier_name",
    "short_name",
    "currency",
    "contact_name",
]


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return  # SQLite test DB: skip view creation; /api/ask requires Postgres.

    json_cols = ",\n  ".join(f"(u.fields ->> '{k}') AS {k}" for k in FIELD_KEYS)
    sql = f"""
        CREATE OR REPLACE VIEW v_unified_records_for_ask AS
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
        """  # noqa: S608
    op.execute(sql)


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.execute("DROP VIEW IF EXISTS v_unified_records_for_ask")
