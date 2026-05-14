"""comparison runs

Revision ID: 004_comparison_runs
Revises: 003_ask_view
Create Date: 2026-05-14
"""

import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "004_comparison_runs"
down_revision = "003_ask_view"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Wipe existing match state — pre-ship, no preservation needed
    # First, drop the foreign key constraint from unified_records
    op.drop_constraint("unified_records_match_candidate_id_fkey", "unified_records", type_="foreignkey")
    op.drop_column("unified_records", "match_candidate_id")

    op.drop_table("match_candidates")
    op.drop_table("match_groups")

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

    # comparison_run_batches (M:N)
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

    # match_groups recreated, now scoped to a run
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

    # match_candidates recreated with polymorphic side kinds
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
        sa.Column(
            "group_id",
            sa.Integer,
            sa.ForeignKey("match_groups.id", ondelete="SET NULL"),
            nullable=True,
        ),
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

    # unified_records: add normalized_name + name_embedding + HNSW index
    op.add_column("unified_records", sa.Column("normalized_name", sa.String(255), nullable=True))
    op.add_column("unified_records", sa.Column("name_embedding", Vector(384), nullable=True))
    op.create_index("ix_unified_records_normalized_name", "unified_records", ["normalized_name"])
    op.execute(
        "CREATE INDEX ix_unified_records_name_embedding_hnsw "
        "ON unified_records USING hnsw (name_embedding vector_cosine_ops) "
        "WITH (m = 16, ef_construction = 64)"
    )

    # import_batches: drop the now-unused matching_task_id
    op.drop_column("import_batches", "matching_task_id")


def downgrade() -> None:
    # Drop the new schema in reverse order
    op.drop_table("match_candidates")
    op.drop_table("match_groups")
    op.drop_index("ix_crb_batch", table_name="comparison_run_batches")
    op.drop_table("comparison_run_batches")
    op.drop_index("ix_comparison_runs_created_at", table_name="comparison_runs")
    op.drop_index("ix_comparison_runs_type_status", table_name="comparison_runs")
    op.drop_table("comparison_runs")

    # Restore unified_records columns
    op.execute("DROP INDEX IF EXISTS ix_unified_records_name_embedding_hnsw")
    op.drop_index("ix_unified_records_normalized_name", table_name="unified_records")
    op.drop_column("unified_records", "name_embedding")
    op.drop_column("unified_records", "normalized_name")

    # Restore import_batches column
    op.add_column("import_batches", sa.Column("matching_task_id", sa.String(255), nullable=True))

    # Recreate the OLD shape of match_groups + match_candidates
    op.create_table(
        "match_groups",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_table(
        "match_candidates",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("record_a_id", sa.Integer, sa.ForeignKey("staged_records.id"), nullable=False),
        sa.Column("record_b_id", sa.Integer, sa.ForeignKey("staged_records.id"), nullable=False),
        sa.Column("confidence", sa.Float, nullable=False),
        sa.Column("match_signals", postgresql.JSONB, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("reviewed_by", sa.String(100), nullable=True),
        sa.Column("reviewed_at", sa.DateTime, nullable=True),
        sa.Column("group_id", sa.Integer, sa.ForeignKey("match_groups.id"), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint("record_a_id", "record_b_id", name="uq_match_pair"),
    )

    # Re-add the match_candidate_id column and foreign key
    op.add_column("unified_records", sa.Column("match_candidate_id", sa.Integer, nullable=True))
    op.create_foreign_key(
        "unified_records_match_candidate_id_fkey", "unified_records", "match_candidates", ["match_candidate_id"], ["id"]
    )
