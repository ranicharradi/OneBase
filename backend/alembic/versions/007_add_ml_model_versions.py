"""Add ml_model_versions table

Revision ID: 007
Revises: 006
Create Date: 2026-03-26

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ml_model_versions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("model_type", sa.String(50), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("feature_names", sa.JSON(), nullable=False),
        sa.Column("metrics", sa.JSON(), nullable=False),
        sa.Column("feature_importances", sa.JSON(), nullable=True),
        sa.Column("sample_count", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), default=False),
        sa.Column("created_by", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_ml_model_type_active", "ml_model_versions", ["model_type", "is_active"])


def downgrade() -> None:
    op.drop_index("ix_ml_model_type_active", table_name="ml_model_versions")
    op.drop_table("ml_model_versions")
