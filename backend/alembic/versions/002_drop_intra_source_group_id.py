"""Drop staged_records.intra_source_group_id and its index.

The intra-source grouping service that populated this column was never wired
into the matching pipeline. The column has always been NULL in production
data, so this is a safe column drop.

Revision ID: 002_drop_intra_source_group_id
Revises: 001_initial_schema
Create Date: 2026-05-16
"""

import sqlalchemy as sa

from alembic import op

revision = "002_drop_intra_source_group_id"
down_revision = "001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("ix_staged_records_intra_group", table_name="staged_records")
    with op.batch_alter_table("staged_records") as batch_op:
        batch_op.drop_column("intra_source_group_id")


def downgrade() -> None:
    with op.batch_alter_table("staged_records") as batch_op:
        batch_op.add_column(
            sa.Column(
                "intra_source_group_id",
                sa.Integer(),
                sa.ForeignKey("staged_records.id"),
                nullable=True,
            )
        )
    op.create_index(
        "ix_staged_records_intra_group",
        "staged_records",
        ["intra_source_group_id"],
    )
