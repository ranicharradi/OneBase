"""Matching engine: match_groups table, group_id on match_candidates, matching_task_id on import_batches

Revision ID: 002
Revises: 001
Create Date: 2026-03-15

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "002"
down_revision: str | None = "001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Create match_groups table
    op.create_table(
        "match_groups",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )

    # Add group_id column to match_candidates with FK to match_groups
    op.add_column(
        "match_candidates",
        sa.Column("group_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_match_candidates_group_id",
        "match_candidates",
        "match_groups",
        ["group_id"],
        ["id"],
    )
    op.create_index(
        "ix_match_candidates_group_id",
        "match_candidates",
        ["group_id"],
    )

    # Add matching_task_id column to import_batches
    op.add_column(
        "import_batches",
        sa.Column("matching_task_id", sa.String(255), nullable=True),
    )


def downgrade() -> None:
    # Drop matching_task_id from import_batches
    op.drop_column("import_batches", "matching_task_id")

    # Drop group_id index, FK, and column from match_candidates
    op.drop_index("ix_match_candidates_group_id", table_name="match_candidates")
    op.drop_constraint("fk_match_candidates_group_id", "match_candidates", type_="foreignkey")
    op.drop_column("match_candidates", "group_id")

    # Drop match_groups table
    op.drop_table("match_groups")
