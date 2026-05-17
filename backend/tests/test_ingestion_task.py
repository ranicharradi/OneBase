"""Tests for ingestion task and service."""

from contextlib import contextmanager
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from app.models.batch import ImportBatch
from app.models.enums import BatchStatus
from app.models.source import DataSource
from app.models.staging import StagedRecord


def _mock_task_session(db):
    """Create a mock get_task_session that yields the given db."""

    @contextmanager
    def _session():
        yield db

    return _session


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
            type="supplier",
            file_format="csv",
            delimiter=";",
            column_mapping={
                "supplier_name": "Name1",
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
            status=BatchStatus.PENDING,
        )
        test_db.add(batch)
        test_db.flush()
        return source, batch

    @patch("app.services.ingestion.compute_embeddings")
    def test_creates_staged_suppliers_with_raw_data(self, mock_embed, test_db):
        """Ingestion creates StagedRecord records with raw_data JSONB."""
        mock_embed.return_value = np.zeros((3, 384), dtype=np.float32)

        source, batch = self._create_source_and_batch(test_db)

        from app.services.ingestion import run_ingestion

        row_count = run_ingestion(test_db, batch.id, SAMPLE_CSV)

        assert row_count == 3

        records = test_db.query(StagedRecord).filter(StagedRecord.import_batch_id == batch.id).all()
        assert len(records) == 3

        # Check first record — supplier fields now in JSONB
        s1 = next(s for s in records if s.fields.get("short_name") == "ACME")
        assert s1.name == "Acme Corp SARL"
        assert s1.fields.get("short_name") == "ACME"
        assert s1.fields.get("currency") == "EUR"
        assert s1.raw_data is not None
        assert "VendorCode" in s1.raw_data

    @patch("app.services.ingestion.compute_embeddings")
    def test_normalizes_names(self, mock_embed, test_db):
        """Ingestion normalizes supplier names."""
        mock_embed.return_value = np.zeros((3, 384), dtype=np.float32)

        source, batch = self._create_source_and_batch(test_db)

        from app.services.ingestion import run_ingestion

        run_ingestion(test_db, batch.id, SAMPLE_CSV)

        records = test_db.query(StagedRecord).filter(StagedRecord.import_batch_id == batch.id).all()

        s1 = next(s for s in records if s.fields.get("short_name") == "ACME")
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
        assert batch.status == BatchStatus.COMPLETED
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
        assert batch.status == BatchStatus.FAILED
        assert "Embedding model failed" in batch.error_message


class TestProcessUploadIdempotency:
    """Tests for process_upload idempotency guard and retry configuration."""

    def _create_source_and_batch(self, test_db, status=BatchStatus.PENDING):
        """Helper: create a data source and import batch with a given status."""
        source = DataSource(
            name="Test Source",
            type="supplier",
            file_format="csv",
            delimiter=";",
            column_mapping={
                "supplier_name": "Name1",
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
            status=status,
        )
        test_db.add(batch)
        test_db.flush()
        return source, batch

    @patch("app.tasks.ingestion.get_task_session")
    def test_skips_already_completed_batch(self, mock_get_session, test_db):
        """process_upload returns early for COMPLETED batches without doing work."""
        mock_get_session.side_effect = _mock_task_session(test_db)
        source, batch = self._create_source_and_batch(test_db, status=BatchStatus.COMPLETED)

        from app.tasks.ingestion import process_upload

        result = process_upload(batch.id)

        assert result["status"] == BatchStatus.COMPLETED
        assert result["batch_id"] == batch.id

    @patch("app.tasks.ingestion.get_task_session")
    def test_skips_already_processing_batch(self, mock_get_session, test_db):
        """process_upload returns early for PROCESSING batches without doing work."""
        mock_get_session.side_effect = _mock_task_session(test_db)
        source, batch = self._create_source_and_batch(test_db, status=BatchStatus.PROCESSING)

        from app.tasks.ingestion import process_upload

        result = process_upload(batch.id)

        assert result["status"] == BatchStatus.PROCESSING
        assert result["batch_id"] == batch.id

    @patch("app.tasks.ingestion.get_task_session")
    def test_sets_processing_status_before_work(self, mock_get_session, test_db):
        """process_upload sets batch to PROCESSING before calling run_ingestion."""
        mock_get_session.side_effect = _mock_task_session(test_db)
        source, batch = self._create_source_and_batch(test_db, status=BatchStatus.PENDING)

        status_at_call_time = []

        def spy_ingestion(db, batch_id, file_content, progress_callback=None):
            """Spy that records batch status at the time run_ingestion is called."""
            b = db.query(ImportBatch).filter(ImportBatch.id == batch_id).one()
            status_at_call_time.append(b.status)
            return 3

        with (
            patch(
                "app.tasks.ingestion.open",
                MagicMock(
                    return_value=MagicMock(
                        __enter__=MagicMock(return_value=MagicMock(read=MagicMock(return_value=SAMPLE_CSV))),
                        __exit__=MagicMock(return_value=False),
                    )
                ),
            ),
            patch("app.services.ingestion.run_ingestion", side_effect=spy_ingestion),
        ):
            from app.tasks.ingestion import process_upload

            process_upload(batch.id)

        assert len(status_at_call_time) == 1
        assert status_at_call_time[0] == BatchStatus.PROCESSING

    @patch("app.tasks.ingestion.get_task_session")
    def test_enqueues_matching_run_when_two_active_batches_exist(self, mock_get_session, test_db):
        """process_upload creates and enqueues a comparison run after a second active batch is ingested."""
        from app.models.staging import StagedRecord

        mock_get_session.side_effect = _mock_task_session(test_db)
        source_a, existing_batch = self._create_source_and_batch(test_db, status=BatchStatus.COMPLETED)
        source_b = DataSource(
            name="Second Source",
            type="supplier",
            file_format="csv",
            delimiter=";",
            column_mapping={"supplier_name": "Name1"},
        )
        test_db.add(source_b)
        test_db.flush()
        new_batch = ImportBatch(
            data_source_id=source_b.id,
            filename="second.csv",
            uploaded_by="testuser",
            status=BatchStatus.PENDING,
        )
        test_db.add(new_batch)
        test_db.flush()
        test_db.add(
            StagedRecord(
                import_batch_id=existing_batch.id,
                data_source_id=source_a.id,
                type="supplier",
                name="Acme",
                fields={"supplier_name": "Acme"},
                raw_data={"Name1": "Acme"},
                status="active",
            )
        )
        test_db.commit()

        def spy_ingestion(db, batch_id, file_content, progress_callback=None):
            db.add(
                StagedRecord(
                    import_batch_id=batch_id,
                    data_source_id=source_b.id,
                    type="supplier",
                    name="Acme Ltd",
                    fields={"supplier_name": "Acme Ltd"},
                    raw_data={"Name1": "Acme Ltd"},
                    status="active",
                )
            )
            batch = db.query(ImportBatch).filter(ImportBatch.id == batch_id).one()
            batch.status = BatchStatus.COMPLETED
            db.flush()
            return 1

        fake_signature = MagicMock()
        fake_signature.id = "comparison-task-id"

        with (
            patch(
                "app.tasks.ingestion.open",
                MagicMock(
                    return_value=MagicMock(
                        __enter__=MagicMock(return_value=MagicMock(read=MagicMock(return_value=SAMPLE_CSV))),
                        __exit__=MagicMock(return_value=False),
                    )
                ),
            ),
            patch("app.services.ingestion.run_ingestion", side_effect=spy_ingestion),
            patch("app.tasks.comparison.run_comparison.s", return_value=fake_signature) as signature_factory,
        ):
            from app.tasks.ingestion import process_upload

            process_upload(new_batch.id)

        signature_factory.assert_called_once()
        fake_signature.freeze.assert_called_once()
        fake_signature.apply_async.assert_called_once()
        from app.models.comparison import ComparisonRun

        run = test_db.query(ComparisonRun).one()
        assert run.task_id == "comparison-task-id"
        assert sorted(batch.id for batch in run.batches) == sorted([existing_batch.id, new_batch.id])

    def test_retry_configuration(self):
        """process_upload has correct retry configuration."""
        from sqlalchemy.exc import OperationalError

        from app.tasks.ingestion import process_upload

        assert process_upload.max_retries == 3
        assert OperationalError in process_upload.autoretry_for
        assert ConnectionError in process_upload.autoretry_for


class TestFileCleanupOnFailure:
    """Tests that failed uploads clean up their files."""

    def test_file_deleted_on_ingestion_failure(self, test_db):
        """When ingestion fails, the uploaded file is deleted from disk."""
        import os

        from app.models.enums import BatchStatus

        source = DataSource(
            name="Test Source",
            type="supplier",
            file_format="csv",
            delimiter=";",
            column_mapping={"supplier_name": "Name1", "short_name": "VendorCode"},
        )
        test_db.add(source)
        test_db.flush()

        os.makedirs("data/uploads", exist_ok=True)
        test_filename = "cleanup_test.csv"
        test_filepath = os.path.join("data", "uploads", test_filename)
        with open(test_filepath, "wb") as f:
            f.write(b"bad data")

        batch = ImportBatch(
            data_source_id=source.id,
            filename=test_filename,
            uploaded_by="testuser",
            status=BatchStatus.PENDING,
        )
        test_db.add(batch)
        test_db.commit()

        with (
            patch("app.tasks.ingestion.get_task_session", side_effect=_mock_task_session(test_db)),
            patch("app.services.ingestion.run_ingestion", side_effect=RuntimeError("Parse error")),
        ):
            from app.tasks.ingestion import process_upload

            with pytest.raises(RuntimeError, match="Parse error"):
                process_upload(batch.id)

        assert not os.path.exists(test_filepath)

    def test_cleanup_failure_does_not_crash(self, test_db):
        """If file cleanup itself fails, the error handler still works."""
        import os

        from app.models.enums import BatchStatus

        source = DataSource(
            name="Test Source",
            type="supplier",
            file_format="csv",
            delimiter=";",
            column_mapping={"supplier_name": "Name1", "short_name": "VendorCode"},
        )
        test_db.add(source)
        test_db.flush()

        os.makedirs("data/uploads", exist_ok=True)
        test_filename = "cleanup_fail_test.csv"
        test_filepath = os.path.join("data", "uploads", test_filename)
        with open(test_filepath, "wb") as f:
            f.write(b"data")

        batch = ImportBatch(
            data_source_id=source.id,
            filename=test_filename,
            uploaded_by="testuser",
            status=BatchStatus.PENDING,
        )
        test_db.add(batch)
        test_db.commit()
        batch_id = batch.id  # save before session closes

        with (
            patch("app.tasks.ingestion.get_task_session", side_effect=_mock_task_session(test_db)),
            patch("app.services.ingestion.run_ingestion", side_effect=RuntimeError("Fail")),
            patch("os.unlink", side_effect=OSError("Permission denied")),
        ):
            from app.tasks.ingestion import process_upload

            with pytest.raises(RuntimeError, match="Fail"):
                process_upload(batch_id)

        # Re-add the session to verify DB state (session was closed by task's finally block)
        test_db.expire_all()
        refreshed = test_db.query(ImportBatch).filter(ImportBatch.id == batch_id).one()
        assert refreshed.status == BatchStatus.FAILED

        # Clean up manually
        if os.path.exists(test_filepath):
            os.unlink(test_filepath)


def test_process_upload_does_not_auto_create_match_run(test_db, monkeypatch):
    """After Track B: ingestion never dispatches matching."""
    from unittest.mock import MagicMock, patch

    from app.models.batch import ImportBatch
    from app.models.comparison import ComparisonRun  # still named pre-Track-C
    from app.models.enums import BatchStatus
    from app.models.source import DataSource

    # Arrange: two sources with an existing completed batch so auto-match would normally fire
    source_a = DataSource(
        name="Source A",
        type="supplier",
        file_format="csv",
        delimiter=";",
        column_mapping={"supplier_name": "Name1"},
    )
    test_db.add(source_a)
    test_db.flush()

    existing_batch = ImportBatch(
        data_source_id=source_a.id,
        filename="existing.csv",
        uploaded_by="testuser",
        status=BatchStatus.COMPLETED,
    )
    test_db.add(existing_batch)
    test_db.flush()

    from app.models.staging import StagedRecord

    test_db.add(
        StagedRecord(
            import_batch_id=existing_batch.id,
            data_source_id=source_a.id,
            type="supplier",
            name="Acme",
            fields={"supplier_name": "Acme"},
            raw_data={"Name1": "Acme"},
            status="active",
        )
    )
    test_db.commit()

    source_b = DataSource(
        name="Source B",
        type="supplier",
        file_format="csv",
        delimiter=";",
        column_mapping={"supplier_name": "Name1"},
    )
    test_db.add(source_b)
    test_db.flush()

    new_batch = ImportBatch(
        data_source_id=source_b.id,
        filename="new.csv",
        uploaded_by="testuser",
        status=BatchStatus.PENDING,
    )
    test_db.add(new_batch)
    test_db.commit()
    batch_id = new_batch.id

    def spy_ingestion(db, bid, file_content, progress_callback=None):
        db.add(
            StagedRecord(
                import_batch_id=bid,
                data_source_id=source_b.id,
                type="supplier",
                name="Acme Ltd",
                fields={"supplier_name": "Acme Ltd"},
                raw_data={"Name1": "Acme Ltd"},
                status="active",
            )
        )
        b = db.query(ImportBatch).filter(ImportBatch.id == bid).one()
        b.status = BatchStatus.COMPLETED
        db.flush()
        return 1

    with (
        patch(
            "app.tasks.ingestion.get_task_session",
            side_effect=_mock_task_session(test_db),
        ),
        patch(
            "app.tasks.ingestion.open",
            MagicMock(
                return_value=MagicMock(
                    __enter__=MagicMock(return_value=MagicMock(read=MagicMock(return_value=SAMPLE_CSV))),
                    __exit__=MagicMock(return_value=False),
                )
            ),
        ),
        patch("app.services.ingestion.run_ingestion", side_effect=spy_ingestion),
        patch("app.services.notifications.publish_notification", lambda *a, **k: None),
    ):
        from app.tasks.ingestion import process_upload

        process_upload(batch_id)

    # Assert: batch completed
    test_db.expire_all()
    batch = test_db.query(ImportBatch).get(batch_id)
    assert batch.status == BatchStatus.COMPLETED

    # Assert: NO ComparisonRun was created
    assert test_db.query(ComparisonRun).count() == 0


class TestRunIngestionXlsx:
    """Integration test for xlsx ingestion through run_ingestion."""

    def _create_xlsx_source_and_batch(self, test_db):
        source = DataSource(
            name="XL Test Source",
            type="supplier",
            file_format="xlsx",
            delimiter=";",
            column_mapping={"supplier_name": "Name", "short_name": "Amount"},
        )
        test_db.add(source)
        test_db.flush()

        batch = ImportBatch(
            data_source_id=source.id,
            filename="vendors.xlsx",
            uploaded_by="testuser",
            status=BatchStatus.PENDING,
        )
        test_db.add(batch)
        test_db.flush()
        return source, batch

    @patch("app.services.ingestion.compute_embeddings")
    def test_run_ingestion_xlsx_preserves_types_in_raw_data(self, mock_embed, test_db):
        """run_ingestion on xlsx bytes preserves numeric/date types in raw_data."""
        from datetime import datetime
        from io import BytesIO

        import openpyxl

        from app.models.enums import RecordStatus
        from app.services.ingestion import run_ingestion

        mock_embed.return_value = np.zeros((1, 384), dtype=np.float32)

        source, batch = self._create_xlsx_source_and_batch(test_db)

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["Name", "Amount", "Active", "Created"])
        ws.append(["Acme Corp", 1234.56, True, datetime(2025, 3, 1)])
        buf = BytesIO()
        wb.save(buf)
        xlsx_bytes = buf.getvalue()

        row_count = run_ingestion(test_db, batch.id, xlsx_bytes)

        assert row_count == 1
        record = (
            test_db.query(StagedRecord)
            .filter(StagedRecord.import_batch_id == batch.id)
            .filter(StagedRecord.status == RecordStatus.ACTIVE)
            .one()
        )
        assert record.name == "Acme Corp"
        # fields are stringified for the matching pipeline
        assert record.fields == {"supplier_name": "Acme Corp", "short_name": "1234.56"}
        # raw_data preserves original types
        assert record.raw_data["Amount"] == 1234.56
        assert record.raw_data["Active"] is True
        assert record.raw_data["Created"] == "2025-03-01"
