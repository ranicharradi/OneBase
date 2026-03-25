"""Add intra_source_group_id to staged_suppliers

Revision ID: 006
Revises: 005
Create Date: 2026-03-25

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "staged_suppliers",
        sa.Column("intra_source_group_id", sa.Integer(), sa.ForeignKey("staged_suppliers.id"), nullable=True),
    )
    op.create_index("ix_staged_intra_group", "staged_suppliers", ["intra_source_group_id"])


def downgrade() -> None:
    op.drop_index("ix_staged_intra_group", table_name="staged_suppliers")
    op.drop_column("staged_suppliers", "intra_source_group_id")
