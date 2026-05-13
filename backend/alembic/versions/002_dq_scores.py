"""dq scores on unified_records

Revision ID: 002_dq_scores
Revises: 001_records_schema
Create Date: 2026-05-13
"""

import sqlalchemy as sa

from alembic import op

revision = "002_dq_scores"
down_revision = "001_records_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("unified_records", sa.Column("dq_completeness", sa.Float(), nullable=True))
    op.add_column("unified_records", sa.Column("dq_validity", sa.Float(), nullable=True))
    op.add_column("unified_records", sa.Column("dq_score", sa.Float(), nullable=True))
    op.create_index("ix_unified_records_dq_score", "unified_records", ["dq_score"])


def downgrade() -> None:
    op.drop_index("ix_unified_records_dq_score", table_name="unified_records")
    op.drop_column("unified_records", "dq_score")
    op.drop_column("unified_records", "dq_validity")
    op.drop_column("unified_records", "dq_completeness")
