from alembic import op

revision = "006_match_run_sources_index"
down_revision = "005_match_runs_source_scoped"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_mrs_data_source", "match_run_sources", ["data_source_id"])


def downgrade() -> None:
    op.drop_index("ix_mrs_data_source", table_name="match_run_sources")
