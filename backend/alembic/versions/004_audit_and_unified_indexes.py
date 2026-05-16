"""Add hot-path indexes.

- ix_audit_log_created_at: dashboard sorts audit rows by created_at desc.
- ix_unified_records_fields_gin: mirrors the existing staged_records GIN
  index so JSONB queries over unified_records.fields are also indexed.

Revision ID: 004_audit_and_unified_indexes
Revises: 003_drop_filename_pattern
Create Date: 2026-05-16
"""

import sqlalchemy as sa

from alembic import op

revision = "004_audit_and_unified_indexes"
down_revision = "003_drop_filename_pattern"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_audit_log_created_at",
        "audit_log",
        [sa.text("created_at DESC")],
    )
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            "CREATE INDEX ix_unified_records_fields_gin "
            "ON unified_records USING gin (fields)"
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP INDEX IF EXISTS ix_unified_records_fields_gin")
    op.drop_index("ix_audit_log_created_at", table_name="audit_log")
