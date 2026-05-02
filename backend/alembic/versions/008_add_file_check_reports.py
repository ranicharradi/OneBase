"""Add file check reports tables

Revision ID: 008
Revises: c3bd8bc39bde
Create Date: 2026-05-02

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "008"
down_revision: str | None = "c3bd8bc39bde"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "file_check_reports",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("stored_filename", sa.String(255), nullable=False),
        sa.Column("file_size_bytes", sa.Integer(), nullable=False),
        sa.Column("delimiter", sa.String(8), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="processing"),
        sa.Column("total_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rows_with_issues", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("empty_row_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("missing_value_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("corrupted_value_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("stored_issue_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("issue_cap_reached", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("criteria_version", sa.String(50), nullable=False, server_default="v1"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("checked_by", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_file_check_reports_created_at", "file_check_reports", ["created_at"])
    op.create_index("ix_file_check_reports_status", "file_check_reports", ["status"])

    op.create_table(
        "file_check_issues",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("report_id", sa.Integer(), sa.ForeignKey("file_check_reports.id"), nullable=False),
        sa.Column("row_number", sa.Integer(), nullable=False),
        sa.Column("column_name", sa.String(255), nullable=True),
        sa.Column("issue_type", sa.String(50), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("value_preview", sa.String(255), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_file_check_issues_report_id", "file_check_issues", ["report_id"])
    op.create_index("ix_file_check_issues_type", "file_check_issues", ["issue_type"])


def downgrade() -> None:
    op.drop_index("ix_file_check_issues_type", table_name="file_check_issues")
    op.drop_index("ix_file_check_issues_report_id", table_name="file_check_issues")
    op.drop_table("file_check_issues")

    op.drop_index("ix_file_check_reports_status", table_name="file_check_reports")
    op.drop_index("ix_file_check_reports_created_at", table_name="file_check_reports")
    op.drop_table("file_check_reports")
