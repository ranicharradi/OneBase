"""Add filename_pattern to data_sources

Revision ID: 004
Revises: 003
Create Date: 2026-03-22

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "004"
down_revision: str | None = "003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "data_sources",
        sa.Column("filename_pattern", sa.String(255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("data_sources", "filename_pattern")
