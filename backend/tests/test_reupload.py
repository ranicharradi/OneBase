"""Tests for re-upload supersession logic."""

from unittest.mock import patch

import numpy as np

from app.models.batch import ImportBatch
from app.models.enums import BatchStatus, CandidateStatus, RecordStatus
from app.models.match import MatchCandidate
from app.models.match_run import MatchRun
from app.models.source import DataSource
from app.models.staging import StagedRecord

SAMPLE_CSV = b"\xef\xbb\xbfVendorCode;Name1\nV001;Acme Corp SARL\nV002;Beta GmbH\n"

SAMPLE_CSV_V2 = b"\xef\xbb\xbfVendorCode;Name1\nV001;Acme Corporation\nV003;Gamma LLC\n"


class TestReuploadSupersession:
    """Tests for re-upload supersession in ingestion service."""

    def _create_source_and_batch(self, test_db):
        """Helper: create a data source and import batch."""
        source = DataSource(
            name="Test Source",
            type="supplier",
            delimiter=";",
            column_mapping={"supplier_name": "Name1", "short_name": "VendorCode"},
        )
        test_db.add(source)
        test_db.flush()

        batch = ImportBatch(
            data_source_id=source.id,
            filename="test.csv",
            uploaded_by="testuser",
            status=BatchStatus.PENDING,
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

        records = (
            test_db.query(StagedRecord)
            .filter(
                StagedRecord.data_source_id == source.id,
                StagedRecord.status == RecordStatus.ACTIVE,
            )
            .all()
        )
        assert len(records) == 2

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
            status=BatchStatus.PENDING,
        )
        test_db.add(batch2)
        test_db.flush()

        run_ingestion(test_db, batch2.id, SAMPLE_CSV_V2)
        test_db.commit()

        # Old records should be superseded
        superseded = (
            test_db.query(StagedRecord)
            .filter(
                StagedRecord.import_batch_id == batch1.id,
                StagedRecord.status == RecordStatus.SUPERSEDED,
            )
            .all()
        )
        assert len(superseded) == 2

        # New records should be active
        active = (
            test_db.query(StagedRecord)
            .filter(
                StagedRecord.import_batch_id == batch2.id,
                StagedRecord.status == RecordStatus.ACTIVE,
            )
            .all()
        )
        assert len(active) == 2

    @patch("app.services.ingestion.compute_embeddings")
    def test_reupload_keeps_pending_candidates_intact(self, mock_embed, test_db):
        """Re-upload supersedes old StagedRecords but leaves PENDING candidates alone.

        The review queue is responsible for filtering stale candidates at query time (Task B3).
        """
        mock_embed.return_value = np.zeros((2, 384), dtype=np.float32)

        source, batch1 = self._create_source_and_batch(test_db)

        from app.services.ingestion import run_ingestion

        run_ingestion(test_db, batch1.id, SAMPLE_CSV)
        test_db.commit()

        # Create a pending match candidate between the two staged records
        records = test_db.query(StagedRecord).filter(StagedRecord.import_batch_id == batch1.id).all()
        run = MatchRun(type="supplier", mode="FILE_VS_FILE", status="pending", created_by="u")
        test_db.add(run)
        test_db.flush()
        match = MatchCandidate(
            type="supplier",
            match_run_id=run.id,
            record_a_id=records[0].id,
            record_b_id=records[1].id,
            confidence=0.85,
            match_signals={"name": 0.9},
            status=CandidateStatus.PENDING,
        )
        test_db.add(match)
        test_db.commit()

        # Second upload
        batch2 = ImportBatch(
            data_source_id=source.id,
            filename="test_v2.csv",
            uploaded_by="testuser",
            status=BatchStatus.PENDING,
        )
        test_db.add(batch2)
        test_db.flush()

        run_ingestion(test_db, batch2.id, SAMPLE_CSV_V2)
        test_db.commit()

        # Old records superseded
        test_db.refresh(records[0])
        assert records[0].status == RecordStatus.SUPERSEDED

        # PENDING candidate is UNCHANGED — review queue filters stale ones at read time
        test_db.refresh(match)
        assert match.status == CandidateStatus.PENDING

    @patch("app.services.ingestion.compute_embeddings")
    def test_reupload_preserves_confirmed_matches(self, mock_embed, test_db):
        """Re-upload does NOT invalidate confirmed match candidates."""
        mock_embed.return_value = np.zeros((2, 384), dtype=np.float32)

        source, batch1 = self._create_source_and_batch(test_db)

        from app.services.ingestion import run_ingestion

        run_ingestion(test_db, batch1.id, SAMPLE_CSV)
        test_db.commit()

        # Create a confirmed match candidate
        records = test_db.query(StagedRecord).filter(StagedRecord.import_batch_id == batch1.id).all()
        run = MatchRun(type="supplier", mode="FILE_VS_FILE", status="pending", created_by="u")
        test_db.add(run)
        test_db.flush()
        match = MatchCandidate(
            type="supplier",
            match_run_id=run.id,
            record_a_id=records[0].id,
            record_b_id=records[1].id,
            confidence=0.95,
            match_signals={"name": 0.95},
            status=CandidateStatus.CONFIRMED,
        )
        test_db.add(match)
        test_db.commit()

        # Second upload
        batch2 = ImportBatch(
            data_source_id=source.id,
            filename="test_v2.csv",
            uploaded_by="testuser",
            status=BatchStatus.PENDING,
        )
        test_db.add(batch2)
        test_db.flush()

        run_ingestion(test_db, batch2.id, SAMPLE_CSV_V2)
        test_db.commit()

        # Confirmed match should be preserved
        test_db.refresh(match)
        assert match.status == CandidateStatus.CONFIRMED
