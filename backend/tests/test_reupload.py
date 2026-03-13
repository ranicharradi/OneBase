"""Tests for re-upload supersession logic."""
import pytest
from unittest.mock import patch, MagicMock
import numpy as np

from app.models.staging import StagedSupplier
from app.models.match import MatchCandidate
from app.models.batch import ImportBatch
from app.models.source import DataSource


SAMPLE_CSV = (
    b"\xef\xbb\xbfVendorCode;Name1\n"
    b"V001;Acme Corp SARL\n"
    b"V002;Beta GmbH\n"
)

SAMPLE_CSV_V2 = (
    b"\xef\xbb\xbfVendorCode;Name1\n"
    b"V001;Acme Corporation\n"
    b"V003;Gamma LLC\n"
)


class TestReuploadSupersession:
    """Tests for re-upload supersession in ingestion service."""

    def _create_source_and_batch(self, test_db):
        """Helper: create a data source and import batch."""
        source = DataSource(
            name="Test Source",
            file_format="csv",
            delimiter=";",
            column_mapping={"supplier_name": "Name1", "supplier_code": "VendorCode"},
        )
        test_db.add(source)
        test_db.flush()

        batch = ImportBatch(
            data_source_id=source.id,
            filename="test.csv",
            uploaded_by="testuser",
            status="pending",
        )
        test_db.add(batch)
        test_db.flush()
        return source, batch

    @patch("app.services.ingestion.compute_embeddings")
    def test_first_upload_creates_active_records(self, mock_embed, test_db):
        """First upload creates staged supplier records with status='active'."""
        mock_embed.return_value = np.zeros((2, 384), dtype=np.float32)

        source, batch = self._create_source_and_batch(test_db)

        from app.services.ingestion import run_ingestion
        run_ingestion(test_db, batch.id, SAMPLE_CSV)

        suppliers = test_db.query(StagedSupplier).filter(
            StagedSupplier.data_source_id == source.id,
            StagedSupplier.status == "active",
        ).all()
        assert len(suppliers) == 2

    @patch("app.services.ingestion.compute_embeddings")
    def test_reupload_supersedes_old_records(self, mock_embed, test_db):
        """Second upload marks old staged records as superseded."""
        mock_embed.return_value = np.zeros((2, 384), dtype=np.float32)

        source, batch1 = self._create_source_and_batch(test_db)

        from app.services.ingestion import run_ingestion
        run_ingestion(test_db, batch1.id, SAMPLE_CSV)
        test_db.commit()

        # Second upload
        batch2 = ImportBatch(
            data_source_id=source.id,
            filename="test_v2.csv",
            uploaded_by="testuser",
            status="pending",
        )
        test_db.add(batch2)
        test_db.flush()

        run_ingestion(test_db, batch2.id, SAMPLE_CSV_V2)
        test_db.commit()

        # Old records should be superseded
        superseded = test_db.query(StagedSupplier).filter(
            StagedSupplier.import_batch_id == batch1.id,
            StagedSupplier.status == "superseded",
        ).all()
        assert len(superseded) == 2

        # New records should be active
        active = test_db.query(StagedSupplier).filter(
            StagedSupplier.import_batch_id == batch2.id,
            StagedSupplier.status == "active",
        ).all()
        assert len(active) == 2

    @patch("app.services.ingestion.compute_embeddings")
    def test_reupload_invalidates_pending_matches(self, mock_embed, test_db):
        """Re-upload invalidates pending match candidates."""
        mock_embed.return_value = np.zeros((2, 384), dtype=np.float32)

        source, batch1 = self._create_source_and_batch(test_db)

        from app.services.ingestion import run_ingestion
        run_ingestion(test_db, batch1.id, SAMPLE_CSV)
        test_db.commit()

        # Create a pending match candidate between the two staged suppliers
        suppliers = test_db.query(StagedSupplier).filter(
            StagedSupplier.import_batch_id == batch1.id
        ).all()
        match = MatchCandidate(
            supplier_a_id=suppliers[0].id,
            supplier_b_id=suppliers[1].id,
            confidence=0.85,
            match_signals={"name": 0.9},
            status="pending",
        )
        test_db.add(match)
        test_db.commit()

        # Second upload
        batch2 = ImportBatch(
            data_source_id=source.id,
            filename="test_v2.csv",
            uploaded_by="testuser",
            status="pending",
        )
        test_db.add(batch2)
        test_db.flush()

        run_ingestion(test_db, batch2.id, SAMPLE_CSV_V2)
        test_db.commit()

        # Pending match should be invalidated
        test_db.refresh(match)
        assert match.status == "invalidated"

    @patch("app.services.ingestion.compute_embeddings")
    def test_reupload_preserves_confirmed_matches(self, mock_embed, test_db):
        """Re-upload does NOT invalidate confirmed match candidates."""
        mock_embed.return_value = np.zeros((2, 384), dtype=np.float32)

        source, batch1 = self._create_source_and_batch(test_db)

        from app.services.ingestion import run_ingestion
        run_ingestion(test_db, batch1.id, SAMPLE_CSV)
        test_db.commit()

        # Create a confirmed match candidate
        suppliers = test_db.query(StagedSupplier).filter(
            StagedSupplier.import_batch_id == batch1.id
        ).all()
        match = MatchCandidate(
            supplier_a_id=suppliers[0].id,
            supplier_b_id=suppliers[1].id,
            confidence=0.95,
            match_signals={"name": 0.95},
            status="confirmed",
        )
        test_db.add(match)
        test_db.commit()

        # Second upload
        batch2 = ImportBatch(
            data_source_id=source.id,
            filename="test_v2.csv",
            uploaded_by="testuser",
            status="pending",
        )
        test_db.add(batch2)
        test_db.flush()

        run_ingestion(test_db, batch2.id, SAMPLE_CSV_V2)
        test_db.commit()

        # Confirmed match should be preserved
        test_db.refresh(match)
        assert match.status == "confirmed"
