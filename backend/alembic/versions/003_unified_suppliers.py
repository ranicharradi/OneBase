"""Unified suppliers (golden records) table for review-merge

Revision ID: 003
Revises: 002
Create Date: 2026-03-15

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "unified_suppliers",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("source_code", sa.String(50), nullable=True),
        sa.Column("short_name", sa.String(50), nullable=True),
        sa.Column("currency", sa.String(10), nullable=True),
        sa.Column("payment_terms", sa.String(50), nullable=True),
        sa.Column("contact_name", sa.String(255), nullable=True),
        sa.Column("supplier_type", sa.String(10), nullable=True),
        sa.Column("provenance", JSONB(), nullable=False),
        sa.Column("source_supplier_ids", JSONB(), nullable=False),
        sa.Column("match_candidate_id", sa.Integer(), nullable=True),
        sa.Column("created_by", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["match_candidate_id"], ["match_candidates.id"]
        ),
    )

    # Index on match_candidate_id for lookup
    op.create_index(
        "ix_unified_match_candidate",
        "unified_suppliers",
        ["match_candidate_id"],
    )

    # Index on created_by for audit queries
    op.create_index(
        "ix_unified_created_by",
        "unified_suppliers",
        ["created_by"],
    )


def downgrade() -> None:
    op.drop_index("ix_unified_created_by", table_name="unified_suppliers")
    op.drop_index("ix_unified_match_candidate", table_name="unified_suppliers")
    op.drop_table("unified_suppliers")
