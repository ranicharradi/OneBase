"""Widen currency and supplier_type columns on staged_suppliers

Revision ID: 005
Revises: 004
Create Date: 2026-03-22

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


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
