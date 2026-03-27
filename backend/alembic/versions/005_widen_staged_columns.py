"""Widen currency and supplier_type columns on staged_suppliers

Revision ID: 005
Revises: 004
Create Date: 2026-03-22

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "005"
down_revision: str | None = "004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "staged_suppliers",
        "currency",
        type_=sa.String(50),
        existing_type=sa.String(10),
        existing_nullable=True,
    )
    op.alter_column(
        "staged_suppliers",
        "supplier_type",
        type_=sa.String(50),
        existing_type=sa.String(10),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "staged_suppliers",
        "currency",
        type_=sa.String(10),
        existing_type=sa.String(50),
        existing_nullable=True,
    )
    op.alter_column(
        "staged_suppliers",
        "supplier_type",
        type_=sa.String(10),
        existing_type=sa.String(50),
        existing_nullable=True,
    )
