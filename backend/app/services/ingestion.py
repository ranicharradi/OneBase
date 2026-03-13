"""Ingestion orchestration service.

Processes uploaded CSV files through the full pipeline:
parse → map → supersede → store → normalize → embed → finalize
"""
import logging
from typing import Callable

import numpy as np
from sqlalchemy.orm import Session

from app.models.batch import ImportBatch
from app.models.source import DataSource
from app.models.staging import StagedSupplier
from app.models.match import MatchCandidate
from app.utils.csv_parser import parse_csv
from app.services.normalization import normalize_name
from app.services.embedding import compute_embeddings

logger = logging.getLogger(__name__)


def run_ingestion(
    db: Session,
    batch_id: int,
    file_content: bytes,
    progress_callback: Callable | None = None,
) -> int:
    """Run the full ingestion pipeline for an uploaded CSV file.

    Steps:
    1. Load batch and data source
    2. Parse CSV
    3. Map columns
    4. Supersede old records (if re-upload)
    5. Store staged suppliers
    6. Normalize names
    7. Compute and store embeddings
    8. Finalize batch

    Args:
        db: SQLAlchemy session
        batch_id: ImportBatch ID
        file_content: Raw CSV file bytes
        progress_callback: Optional callback(stage, progress_pct)

    Returns:
        Number of rows processed
    """
    batch = db.query(ImportBatch).filter(ImportBatch.id == batch_id).one()
    source = db.query(DataSource).filter(DataSource.id == batch.data_source_id).one()
    column_mapping = source.column_mapping

    try:
        # 1. PARSE
        if progress_callback:
            progress_callback("parsing", 0)

        rows = parse_csv(file_content, delimiter=source.delimiter)

        if not rows:
            batch.row_count = 0
            batch.status = "completed"
            if progress_callback:
                progress_callback("complete", 100)
            return 0

        # 2. SUPERSEDE old records (if this source has existing active records)
        existing_active = db.query(StagedSupplier).filter(
            StagedSupplier.data_source_id == source.id,
            StagedSupplier.status == "active",
        ).all()

        if existing_active:
            # Mark all existing active records as superseded
            superseded_ids = [s.id for s in existing_active]
            db.query(StagedSupplier).filter(
                StagedSupplier.id.in_(superseded_ids)
            ).update({"status": "superseded"}, synchronize_session="fetch")

            # Invalidate pending match candidates referencing superseded records
            if superseded_ids:
                db.query(MatchCandidate).filter(
                    MatchCandidate.status == "pending",
                    (
                        MatchCandidate.supplier_a_id.in_(superseded_ids)
                        | MatchCandidate.supplier_b_id.in_(superseded_ids)
                    ),
                ).update({"status": "invalidated"}, synchronize_session="fetch")

        # 3. MAP columns and STORE staged suppliers
        suppliers = []
        for row in rows:
            # Extract key fields using column mapping
            supplier = StagedSupplier(
                import_batch_id=batch.id,
                data_source_id=source.id,
                source_code=row.get(column_mapping.get("supplier_code", ""), ""),
                name=row.get(column_mapping.get("supplier_name", ""), ""),
                short_name=row.get(column_mapping.get("short_name", ""), None) or None,
                currency=row.get(column_mapping.get("currency", ""), None) or None,
                payment_terms=row.get(column_mapping.get("payment_terms", ""), None) or None,
                contact_name=row.get(column_mapping.get("contact_name", ""), None) or None,
                supplier_type=row.get(column_mapping.get("supplier_type", ""), None) or None,
                status="active",
                raw_data=row,
            )
            suppliers.append(supplier)

        db.add_all(suppliers)
        db.flush()

        if progress_callback:
            progress_callback("normalizing", 33)

        # 4. NORMALIZE names
        for supplier in suppliers:
            supplier.normalized_name = normalize_name(supplier.name)

        db.flush()

        if progress_callback:
            progress_callback("normalizing", 50)

        # 5. EMBED
        if progress_callback:
            progress_callback("embedding", 66)

        normalized_names = [s.normalized_name or "" for s in suppliers]
        embeddings = compute_embeddings(normalized_names)

        for i, supplier in enumerate(suppliers):
            # Store embedding as list for JSON-compatible storage (SQLite)
            # In PostgreSQL with pgvector, this would be stored as Vector
            supplier.name_embedding = embeddings[i].tolist()

        db.flush()

        # 6. FINALIZE
        batch.row_count = len(rows)
        batch.status = "completed"
        db.flush()

        if progress_callback:
            progress_callback("complete", 100)

        return len(rows)

    except Exception as e:
        batch.status = "failed"
        batch.error_message = str(e)
        db.flush()
        raise
