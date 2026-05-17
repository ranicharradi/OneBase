"""Initial records schema (clean break from supplier-only era).

Revision ID: 001_initial_schema
Revises:
Create Date: 2026-05-04
"""

import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = "001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # pgvector extension
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # users
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("username", sa.String(100), unique=True, nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean, server_default=sa.true(), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="viewer"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # data_sources — gains `type` (record-type key)
    op.create_table(
        "data_sources",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(100), unique=True, nullable=False),
        sa.Column("type", sa.String(50), nullable=False),  # references a RecordType.key
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("file_format", sa.String(20), nullable=False, server_default="csv"),
        sa.Column("delimiter", sa.String(5), server_default=";"),
        sa.Column("column_mapping", postgresql.JSONB, nullable=False),
        sa.Column("filename_pattern", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("ix_data_sources_type", "data_sources", ["type"])

    # import_batches
    op.create_table(
        "import_batches",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("data_source_id", sa.Integer, sa.ForeignKey("data_sources.id"), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("uploaded_by", sa.String(100), nullable=False),
        sa.Column("row_count", sa.Integer, nullable=True),
        sa.Column("status", sa.String(20), server_default="pending"),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("task_id", sa.String(255), nullable=True),
    )

    # staged_records — hybrid storage: universal name + JSONB extras
    op.create_table(
        "staged_records",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("import_batch_id", sa.Integer, sa.ForeignKey("import_batches.id"), nullable=False),
        sa.Column("data_source_id", sa.Integer, sa.ForeignKey("data_sources.id"), nullable=False),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), server_default="active"),  # active/superseded
        sa.Column("name", sa.String(255), nullable=True),  # populated from the NAME-role field
        sa.Column("normalized_name", sa.String(255), nullable=True),
        sa.Column("name_embedding", Vector(384), nullable=True),
        sa.Column("fields", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("raw_data", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("intra_source_group_id", sa.Integer, sa.ForeignKey("staged_records.id"), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_index("ix_staged_records_normalized_name", "staged_records", ["normalized_name"])
    op.create_index("ix_staged_records_source_status", "staged_records", ["data_source_id", "status"])
    op.create_index("ix_staged_records_type_source", "staged_records", ["type", "data_source_id"])
    op.create_index("ix_staged_records_intra_group", "staged_records", ["intra_source_group_id"])
    op.create_index("ix_staged_records_fields_gin", "staged_records", ["fields"], postgresql_using="gin")
    op.execute(
        "CREATE INDEX ix_staged_records_name_embedding_hnsw "
        "ON staged_records USING hnsw (name_embedding vector_cosine_ops) "
        "WITH (m = 16, ef_construction = 64)"
    )

    # comparison_runs
    op.create_table(
        "comparison_runs",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("mode", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("created_by", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("started_at", sa.DateTime, nullable=True),
        sa.Column("finished_at", sa.DateTime, nullable=True),
        sa.Column("task_id", sa.String(255), nullable=True),
        sa.Column("stats", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("error_message", sa.Text, nullable=True),
    )
    op.create_index("ix_comparison_runs_type_status", "comparison_runs", ["type", "status"])
    op.create_index("ix_comparison_runs_created_at", "comparison_runs", [sa.text("created_at DESC")])

    # comparison_run_batches
    op.create_table(
        "comparison_run_batches",
        sa.Column(
            "comparison_run_id",
            sa.Integer,
            sa.ForeignKey("comparison_runs.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "import_batch_id",
            sa.Integer,
            sa.ForeignKey("import_batches.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )
    op.create_index("ix_crb_batch", "comparison_run_batches", ["import_batch_id"])

    # match_groups
    op.create_table(
        "match_groups",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column(
            "comparison_run_id",
            sa.Integer,
            sa.ForeignKey("comparison_runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_match_groups_run", "match_groups", ["comparison_run_id"])

    # match_candidates
    op.create_table(
        "match_candidates",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column(
            "comparison_run_id",
            sa.Integer,
            sa.ForeignKey("comparison_runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("record_a_id", sa.Integer, nullable=False),
        sa.Column("record_b_id", sa.Integer, nullable=False),
        sa.Column("side_a_kind", sa.String(10), nullable=False, server_default="staged"),
        sa.Column("side_b_kind", sa.String(10), nullable=False, server_default="staged"),
        sa.Column("confidence", sa.Float, nullable=False),
        sa.Column("match_signals", postgresql.JSONB, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("reviewed_by", sa.String(100), nullable=True),
        sa.Column("reviewed_at", sa.DateTime, nullable=True),
        sa.Column("group_id", sa.Integer, sa.ForeignKey("match_groups.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint(
            "comparison_run_id",
            "record_a_id",
            "record_b_id",
            "side_a_kind",
            "side_b_kind",
            name="uq_match_pair_per_run",
        ),
    )
    op.create_index("ix_match_candidates_run", "match_candidates", ["comparison_run_id"])
    op.create_index("ix_match_candidates_status", "match_candidates", ["status"])

    # unified_records
    op.create_table(
        "unified_records",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("normalized_name", sa.String(255), nullable=True),
        sa.Column("name_embedding", Vector(384), nullable=True),
        sa.Column("fields", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("provenance", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("source_record_ids", postgresql.JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("dq_completeness", sa.Float(), nullable=True),
        sa.Column("dq_validity", sa.Float(), nullable=True),
        sa.Column("dq_score", sa.Float(), nullable=True),
        sa.Column("created_by", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_unified_records_type", "unified_records", ["type"])
    op.create_index("ix_unified_records_normalized_name", "unified_records", ["normalized_name"])
    op.create_index("ix_unified_records_dq_score", "unified_records", ["dq_score"])
    op.execute(
        "CREATE INDEX ix_unified_records_name_embedding_hnsw "
        "ON unified_records USING hnsw (name_embedding vector_cosine_ops) "
        "WITH (m = 16, ef_construction = 64)"
    )
    # The v_unified_records_for_ask view is built dynamically on app startup
    # from the live record_types registry (services/ask_view.py).

    # audit_log
    op.create_table(
        "audit_log",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("entity_type", sa.String(50), nullable=True),
        sa.Column("entity_id", sa.Integer, nullable=True),
        sa.Column("details", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ml_model_versions
    op.create_table(
        "ml_model_versions",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("model_type", sa.String(50), nullable=False),  # "scorer" | "blocker"
        sa.Column("record_type", sa.String(50), nullable=False),  # RecordType.key the model was trained for
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("feature_names", postgresql.JSONB, nullable=False),
        sa.Column("metrics", postgresql.JSONB, nullable=False),
        sa.Column("feature_importances", postgresql.JSONB, nullable=True),
        sa.Column("sample_count", sa.Integer, nullable=False),
        sa.Column("is_active", sa.Boolean, server_default=sa.false(), nullable=False),
        sa.Column("created_by", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_ml_model_active",
        "ml_model_versions",
        ["model_type", "record_type", "is_active"],
    )

    # file_check_reports
    op.create_table(
        "file_check_reports",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("stored_filename", sa.String(255), nullable=False),
        sa.Column("file_size_bytes", sa.Integer, nullable=False),
        sa.Column("delimiter", sa.String(8), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="processing"),
        sa.Column("total_rows", sa.Integer, nullable=False, server_default="0"),
        sa.Column("criteria_version", sa.String(50), nullable=False, server_default="v1"),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("checked_by", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime, nullable=True),
    )
    # file_check_issues
    op.create_table(
        "file_check_issues",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("report_id", sa.Integer, sa.ForeignKey("file_check_reports.id"), nullable=False),
        sa.Column("row_number", sa.Integer, nullable=False),
        sa.Column("column_name", sa.String(255), nullable=True),
        sa.Column("issue_type", sa.String(50), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("value_preview", sa.String(255), nullable=True),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_file_check_issues_report_id", "file_check_issues", ["report_id"])

    # NOTE: the ask view is created/refreshed by app.services.ask_view.refresh_ask_view()
    # on FastAPI startup (see app/main.py lifespan). Migrations stay agnostic of which
    # record types are registered.


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS v_unified_records_for_ask")
    op.drop_table("file_check_issues")
    op.drop_table("file_check_reports")
    op.drop_table("ml_model_versions")
    op.drop_table("audit_log")
    op.drop_table("unified_records")
    op.drop_table("match_candidates")
    op.drop_table("match_groups")
    op.drop_table("comparison_run_batches")
    op.drop_table("comparison_runs")
    op.drop_table("staged_records")
    op.drop_table("import_batches")
    op.drop_table("data_sources")
    op.drop_table("users")
