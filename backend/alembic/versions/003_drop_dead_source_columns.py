"""drop file_format and filename_pattern from data_sources

Revision ID: 003_drop_dead_source_columns
Revises: 002_rename_comparison_to_match
"""

import sqlalchemy as sa

from alembic import op

revision = "003_drop_dead_source_columns"
down_revision = "002_rename_comparison_to_match"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("data_sources", "file_format")
    op.drop_column("data_sources", "filename_pattern")


def downgrade() -> None:
    op.add_column("data_sources", sa.Column("filename_pattern", sa.String(length=255), nullable=True))
    op.add_column(
        "data_sources",
        sa.Column("file_format", sa.String(length=20), nullable=False, server_default="csv"),
    )
