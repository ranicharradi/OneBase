"""Drop data_sources.filename_pattern.

The column was stored and validated server-side but never consulted by the
upload/ingestion pipeline. UI weight without function — removed.

Revision ID: 003_drop_filename_pattern
Revises: 002_drop_intra_source_group_id
Create Date: 2026-05-16
"""

import sqlalchemy as sa

from alembic import op

revision = "003_drop_filename_pattern"
down_revision = "002_drop_intra_source_group_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("data_sources") as batch_op:
        batch_op.drop_column("filename_pattern")


def downgrade() -> None:
    with op.batch_alter_table("data_sources") as batch_op:
        batch_op.add_column(sa.Column("filename_pattern", sa.String(255), nullable=True))
