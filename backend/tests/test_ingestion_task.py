"""Tests for ingestion task and service."""
import pytest
from unittest.mock import patch, MagicMock, call
import numpy as np

from app.models.staging import StagedSupplier
from app.models.batch import ImportBatch
from app.models.source import DataSource


SAMPLE_CSV = (
    b"\xef\xbb\xbfVendorCode;Name1;ShortName;Currency\n"
    b"V001;Acme Corp SARL;ACME;EUR\n"
    b"V002;Beta GmbH;BETA;USD\n"
    b"V003;Gamma LLC;GAMMA;GBP\n"
)


class TestRunIngestion:
    """Tests for run_ingestion service function."""

    def _create_source_and_batch(self, test_db):
        """Helper: create a data source and import batch."""
        source = DataSource(
            name="Test Source",
            file_format="csv",
            delimiter=";",
            column_mapping={
                "supplier_name": "Name1",
                "supplier_code": "VendorCode",
                "short_name": "ShortName",
                "currency": "Currency",
            },
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
    def test_creates_staged_suppliers_with_raw_data(self, mock_embed, test_db):
        """Ingestion creates StagedSupplier records with raw_data JSONB."""
        mock_embed.return_value = np.zeros((3, 384), dtype=np.float32)

        source, batch = self._create_source_and_batch(test_db)

        from app.services.ingestion import run_ingestion
        row_count = run_ingestion(test_db, batch.id, SAMPLE_CSV)

        assert row_count == 3

        suppliers = test_db.query(StagedSupplier).filter(
            StagedSupplier.import_batch_id == batch.id
        ).all()
        assert len(suppliers) == 3

        # Check first supplier
        s1 = next(s for s in suppliers if s.source_code == "V001")
        assert s1.name == "Acme Corp SARL"
        assert s1.short_name == "ACME"
        assert s1.currency == "EUR"
        assert s1.raw_data is not None
        assert "VendorCode" in s1.raw_data

    @patch("app.services.ingestion.compute_embeddings")
    def test_normalizes_names(self, mock_embed, test_db):
        """Ingestion normalizes supplier names."""
        mock_embed.return_value = np.zeros((3, 384), dtype=np.float32)

        source, batch = self._create_source_and_batch(test_db)

        from app.services.ingestion import run_ingestion
        run_ingestion(test_db, batch.id, SAMPLE_CSV)

        suppliers = test_db.query(StagedSupplier).filter(
            StagedSupplier.import_batch_id == batch.id
        ).all()

        s1 = next(s for s in suppliers if s.source_code == "V001")
        # "Acme Corp SARL" -> normalized: "ACME" (CORP and SARL removed)
        assert s1.normalized_name is not None
        assert s1.normalized_name == "ACME"

    @patch("app.services.ingestion.compute_embeddings")
    def test_stores_embeddings(self, mock_embed, test_db):
        """Ingestion computes and stores name embeddings."""
        fake_embeddings = np.random.randn(3, 384).astype(np.float32)
        mock_embed.return_value = fake_embeddings

        source, batch = self._create_source_and_batch(test_db)

        from app.services.ingestion import run_ingestion
        run_ingestion(test_db, batch.id, SAMPLE_CSV)

        # Verify compute_embeddings was called with normalized names
        mock_embed.assert_called_once()
        call_args = mock_embed.call_args[0][0]
        assert len(call_args) == 3

    @patch("app.services.ingestion.compute_embeddings")
    def test_updates_batch_status(self, mock_embed, test_db):
        """Ingestion updates batch status to completed."""
        mock_embed.return_value = np.zeros((3, 384), dtype=np.float32)

        source, batch = self._create_source_and_batch(test_db)

        from app.services.ingestion import run_ingestion
        run_ingestion(test_db, batch.id, SAMPLE_CSV)

        test_db.refresh(batch)
        assert batch.status == "completed"
        assert batch.row_count == 3

    @patch("app.services.ingestion.compute_embeddings")
    def test_progress_callback(self, mock_embed, test_db):
        """Ingestion calls progress callback with correct stages."""
        mock_embed.return_value = np.zeros((3, 384), dtype=np.float32)

        source, batch = self._create_source_and_batch(test_db)
        callback = MagicMock()

        from app.services.ingestion import run_ingestion
        run_ingestion(test_db, batch.id, SAMPLE_CSV, progress_callback=callback)

        # Verify callback was called with expected stages
        stages = [c[0][0] for c in callback.call_args_list]
        assert "parsing" in stages
        assert "normalizing" in stages
        assert "embedding" in stages
        assert "complete" in stages

    @patch("app.services.ingestion.compute_embeddings")
    def test_error_sets_batch_failed(self, mock_embed, test_db):
        """On error, batch status is set to 'failed' with error message."""
        mock_embed.side_effect = RuntimeError("Embedding model failed")

        source, batch = self._create_source_and_batch(test_db)

        from app.services.ingestion import run_ingestion
        with pytest.raises(RuntimeError):
            run_ingestion(test_db, batch.id, SAMPLE_CSV)

        test_db.refresh(batch)
        assert batch.status == "failed"
        assert "Embedding model failed" in batch.error_message


class TestMatchingStub:
    """Tests for matching stub task."""

    def test_matching_stub_is_enqueued(self, test_db):
        """Matching stub task is callable and returns stub result."""
        from app.tasks.matching import run_matching
        result = run_matching(batch_id=42)
        assert result["status"] == "stub"
        assert result["batch_id"] == 42
