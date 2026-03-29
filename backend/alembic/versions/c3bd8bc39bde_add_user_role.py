"""add_user_role

Revision ID: c3bd8bc39bde
Revises: 007
Create Date: 2026-03-29 14:55:59.686741

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3bd8bc39bde"
down_revision: str | None = "007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("role", sa.String(20), nullable=False, server_default="viewer"))
    op.execute("UPDATE users SET role = 'admin' WHERE username = (SELECT username FROM users ORDER BY id LIMIT 1)")


def downgrade() -> None:
    op.drop_column("users", "role")
