"""rename comparison_runs to match_runs

Revision ID: 002_rename_comparison_to_match
Revises: 001_initial_schema
"""

from alembic import op

revision = "002_rename_comparison_to_match"
down_revision = "001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop old indexes that name the comparison_* columns/tables explicitly.
    op.drop_index("ix_match_candidates_run", table_name="match_candidates")
    op.drop_index("ix_match_groups_run", table_name="match_groups")
    op.drop_index("ix_crb_batch", table_name="comparison_run_batches")
    op.drop_index("ix_comparison_runs_created_at", table_name="comparison_runs")
    op.drop_index("ix_comparison_runs_type_status", table_name="comparison_runs")

    # Rename association table + its FK column
    op.rename_table("comparison_run_batches", "match_run_batches")
    op.alter_column("match_run_batches", "comparison_run_id", new_column_name="match_run_id")

    # Rename main table
    op.rename_table("comparison_runs", "match_runs")

    # Rename FK columns on dependent tables
    op.alter_column("match_groups", "comparison_run_id", new_column_name="match_run_id")
    op.alter_column("match_candidates", "comparison_run_id", new_column_name="match_run_id")

    # Recreate indexes with the new names
    op.create_index("ix_match_runs_type_status", "match_runs", ["type", "status"])
    op.execute("CREATE INDEX ix_match_runs_created_at ON match_runs (created_at DESC)")
    op.create_index("ix_mrb_batch", "match_run_batches", ["import_batch_id"])
    op.create_index("ix_match_groups_run", "match_groups", ["match_run_id"])
    op.create_index("ix_match_candidates_run", "match_candidates", ["match_run_id"])


def downgrade() -> None:
    # Drop the new indexes
    op.drop_index("ix_match_candidates_run", table_name="match_candidates")
    op.drop_index("ix_match_groups_run", table_name="match_groups")
    op.drop_index("ix_mrb_batch", table_name="match_run_batches")
    op.drop_index("ix_match_runs_created_at", table_name="match_runs")
    op.drop_index("ix_match_runs_type_status", table_name="match_runs")

    # Reverse column + table renames
    op.alter_column("match_candidates", "match_run_id", new_column_name="comparison_run_id")
    op.alter_column("match_groups", "match_run_id", new_column_name="comparison_run_id")
    op.rename_table("match_runs", "comparison_runs")
    op.alter_column("match_run_batches", "match_run_id", new_column_name="comparison_run_id")
    op.rename_table("match_run_batches", "comparison_run_batches")

    # Recreate the original indexes
    op.create_index("ix_comparison_runs_type_status", "comparison_runs", ["type", "status"])
    op.execute("CREATE INDEX ix_comparison_runs_created_at ON comparison_runs (created_at DESC)")
    op.create_index("ix_crb_batch", "comparison_run_batches", ["import_batch_id"])
    op.create_index("ix_match_groups_run", "match_groups", ["comparison_run_id"])
    op.create_index("ix_match_candidates_run", "match_candidates", ["comparison_run_id"])
