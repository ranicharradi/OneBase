"""files_datasources_redesign

Revision ID: 004_files_datasources_redesign
Revises: 003_drop_dead_source_columns
Create Date: 2026-05-17

Adds DataSource.identity_field_key, ImportBatch.{original_filename, file_extension, ingest_stats},
and reserves RecordStatus.RETIRED at the application layer (no enum type in DB — status is a String).
"""

import sqlalchemy as sa

from alembic import op

revision = "004_files_datasources_redesign"
down_revision = "003_drop_dead_source_columns"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "data_sources",
        sa.Column("identity_field_key", sa.String(length=64), nullable=False),
    )
    op.add_column(
        "import_batches",
        sa.Column("original_filename", sa.String(length=255), nullable=False),
    )
    op.add_column(
        "import_batches",
        sa.Column("file_extension", sa.String(length=16), nullable=False),
    )
    op.add_column(
        "import_batches",
        sa.Column("ingest_stats", sa.JSON(), nullable=True),
    )


def downgrade():
    op.drop_column("import_batches", "ingest_stats")
    op.drop_column("import_batches", "file_extension")
    op.drop_column("import_batches", "original_filename")
    op.drop_column("data_sources", "identity_field_key")
