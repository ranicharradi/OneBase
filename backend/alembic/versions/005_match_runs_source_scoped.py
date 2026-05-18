import sqlalchemy as sa

from alembic import op

revision = "005_match_runs_source_scoped"
down_revision = "004_files_datasources_redesign"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "match_run_sources",
        sa.Column("match_run_id", sa.Integer(), sa.ForeignKey("match_runs.id", ondelete="CASCADE"), primary_key=True),
        sa.Column(
            "data_source_id", sa.Integer(), sa.ForeignKey("data_sources.id", ondelete="CASCADE"), primary_key=True
        ),
    )
    op.drop_table("match_run_batches")


def downgrade() -> None:
    op.create_table(
        "match_run_batches",
        sa.Column("match_run_id", sa.Integer(), sa.ForeignKey("match_runs.id", ondelete="CASCADE"), primary_key=True),
        sa.Column(
            "import_batch_id", sa.Integer(), sa.ForeignKey("import_batches.id", ondelete="CASCADE"), primary_key=True
        ),
    )
    op.drop_table("match_run_sources")
