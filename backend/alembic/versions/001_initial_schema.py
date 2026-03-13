"""Initial schema with all Phase 1 tables

Revision ID: 001
Revises:
Create Date: 2026-03-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable pgvector extension
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # Users table
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("username", sa.String(100), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username"),
    )

    # Audit log table
    op.create_table(
        "audit_log",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("entity_type", sa.String(50), nullable=True),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("details", JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
    )

    # Data sources table
    op.create_table(
        "data_sources",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("file_format", sa.String(20), nullable=False, server_default="csv"),
        sa.Column("delimiter", sa.String(5), server_default=";"),
        sa.Column("column_mapping", JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    # Import batches table
    op.create_table(
        "import_batches",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("data_source_id", sa.Integer(), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("uploaded_by", sa.String(100), nullable=False),
        sa.Column("row_count", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(20), server_default="pending"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("task_id", sa.String(255), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["data_source_id"], ["data_sources.id"]),
    )

    # Staged suppliers table
    op.create_table(
        "staged_suppliers",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("import_batch_id", sa.Integer(), nullable=False),
        sa.Column("data_source_id", sa.Integer(), nullable=False),
        sa.Column("source_code", sa.String(50), nullable=True),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("short_name", sa.String(50), nullable=True),
        sa.Column("currency", sa.String(10), nullable=True),
        sa.Column("payment_terms", sa.String(50), nullable=True),
        sa.Column("contact_name", sa.String(255), nullable=True),
        sa.Column("supplier_type", sa.String(10), nullable=True),
        sa.Column("status", sa.String(20), server_default="active"),
        sa.Column("raw_data", JSONB(), nullable=False),
        sa.Column("normalized_name", sa.String(255), nullable=True),
        # name_embedding added via raw SQL below (vector type)
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["import_batch_id"], ["import_batches.id"]),
        sa.ForeignKeyConstraint(["data_source_id"], ["data_sources.id"]),
    )

    # Add vector column via raw SQL since alembic doesn't natively handle pgvector types
    op.execute("ALTER TABLE staged_suppliers ADD COLUMN name_embedding vector(384)")

    # Indexes for staged_suppliers
    op.create_index("ix_staged_normalized_name", "staged_suppliers", ["normalized_name"])
    op.create_index("ix_staged_source_status", "staged_suppliers", ["data_source_id", "status"])
    op.create_index("ix_staged_source_code", "staged_suppliers", ["data_source_id", "source_code"])

    # HNSW vector index for embedding similarity search
    op.execute(
        "CREATE INDEX ix_staged_name_embedding_hnsw ON staged_suppliers "
        "USING hnsw (name_embedding vector_cosine_ops) "
        "WITH (m = 16, ef_construction = 64)"
    )

    # Match candidates table
    op.create_table(
        "match_candidates",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("supplier_a_id", sa.Integer(), nullable=False),
        sa.Column("supplier_b_id", sa.Integer(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("match_signals", JSONB(), nullable=False),
        sa.Column("status", sa.String(20), server_default="pending"),
        sa.Column("reviewed_by", sa.String(100), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["supplier_a_id"], ["staged_suppliers.id"]),
        sa.ForeignKeyConstraint(["supplier_b_id"], ["staged_suppliers.id"]),
        sa.UniqueConstraint("supplier_a_id", "supplier_b_id", name="uq_match_pair"),
    )


def downgrade() -> None:
    op.drop_table("match_candidates")
    op.drop_index("ix_staged_name_embedding_hnsw", table_name="staged_suppliers")
    op.drop_index("ix_staged_source_code", table_name="staged_suppliers")
    op.drop_index("ix_staged_source_status", table_name="staged_suppliers")
    op.drop_index("ix_staged_normalized_name", table_name="staged_suppliers")
    op.drop_table("staged_suppliers")
    op.drop_table("import_batches")
    op.drop_table("data_sources")
    op.drop_table("audit_log")
    op.drop_table("users")
    op.execute("DROP EXTENSION IF EXISTS vector")
