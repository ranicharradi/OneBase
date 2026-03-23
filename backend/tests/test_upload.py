"""Tests for upload endpoint and batch management."""
import pytest
from unittest.mock import patch, MagicMock


VALID_SOURCE = {
    "name": "SAP Export",
    "description": "SAP supplier export",
    "file_format": "csv",
    "delimiter": ";",
    "column_mapping": {
        "supplier_name": "Name1",
        "supplier_code": "VendorCode",
    },
}

SAMPLE_CSV = (
    b"\xef\xbb\xbfVendorCode;Name1;ShortName;Currency\n"
    b"V001;Acme Corp SARL;ACME;EUR\n"
    b"V002;Beta GmbH;BETA;USD\n"
    b"V003;Gamma LLC;GAMMA;GBP\n"
    b"V004;Delta SA;DELTA;EUR\n"
    b"V005;Epsilon SAS;EPS;EUR\n"
)


class TestUploadEndpoint:
    """Tests for POST /api/import/upload."""

    def test_upload_creates_batch(self, authenticated_client, test_db):
        """Upload creates ImportBatch and returns batch_id + task_id."""
        # Create a data source first
        source_resp = authenticated_client.post("/api/sources", json=VALID_SOURCE)
        source_id = source_resp.json()["id"]

        # Mock the Celery task dispatch
        with patch("app.routers.upload.process_upload") as mock_task:
            mock_result = MagicMock()
            mock_result.id = "test-task-id-123"
            mock_task.delay.return_value = mock_result

            response = authenticated_client.post(
                "/api/import/upload",
                data={"data_source_id": str(source_id)},
                files={"file": ("suppliers.csv", SAMPLE_CSV, "text/csv")},
            )

        assert response.status_code == 201
        data = response.json()
        assert "batch_id" in data
        assert data["task_id"] == "test-task-id-123"
        assert data["filename"] == "suppliers.csv"

    def test_upload_invalid_source_id(self, authenticated_client, test_db):
        """Upload with non-existent data_source_id returns 404."""
        with patch("app.routers.upload.process_upload") as mock_task:
            response = authenticated_client.post(
                "/api/import/upload",
                data={"data_source_id": "999"},
                files={"file": ("test.csv", b"code;name\n001;Acme\n", "text/csv")},
            )
        assert response.status_code == 404

    def test_upload_requires_auth(self, test_client, test_db):
        """Upload without auth returns 401."""
        response = test_client.post(
            "/api/import/upload",
            data={"data_source_id": "1"},
            files={"file": ("test.csv", b"code;name\n001;Acme\n", "text/csv")},
        )
        assert response.status_code == 401


    def test_upload_rejects_oversized_file(self, authenticated_client, test_db):
        """Upload with file exceeding 50MB returns 413."""
        source_resp = authenticated_client.post("/api/sources", json=VALID_SOURCE)
        source_id = source_resp.json()["id"]

        # Create content just over the limit (50 MB + 1 byte)
        oversized_content = b"x" * (50 * 1024 * 1024 + 1)

        with patch("app.routers.upload.process_upload"):
            response = authenticated_client.post(
                "/api/import/upload",
                data={"data_source_id": str(source_id)},
                files={"file": ("huge.csv", oversized_content, "text/csv")},
            )

        assert response.status_code == 413

    def test_upload_rejects_non_csv_file(self, authenticated_client, test_db):
        """Upload with non-.csv extension returns 400."""
        source_resp = authenticated_client.post("/api/sources", json=VALID_SOURCE)
        source_id = source_resp.json()["id"]

        with patch("app.routers.upload.process_upload"):
            response = authenticated_client.post(
                "/api/import/upload",
                data={"data_source_id": str(source_id)},
                files={"file": ("suppliers.xlsx", b"fake excel content", "application/vnd.ms-excel")},
            )

        assert response.status_code == 400
        assert "csv" in response.json()["detail"].lower()


class TestBatchListEndpoint:
    """Tests for GET /api/import/batches."""

    def test_list_batches(self, authenticated_client, test_db):
        """Returns list of batches."""
        # Create source and upload
        source_resp = authenticated_client.post("/api/sources", json=VALID_SOURCE)
        source_id = source_resp.json()["id"]

        with patch("app.routers.upload.process_upload") as mock_task:
            mock_result = MagicMock()
            mock_result.id = "test-task-id-123"
            mock_task.delay.return_value = mock_result

            authenticated_client.post(
                "/api/import/upload",
                data={"data_source_id": str(source_id)},
                files={"file": ("suppliers.csv", SAMPLE_CSV, "text/csv")},
            )

        response = authenticated_client.get(f"/api/import/batches?data_source_id={source_id}")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["data_source_id"] == source_id


class TestTaskStatusEndpoint:
    """Tests for GET /api/import/batches/{task_id}/status."""

    def test_task_status(self, authenticated_client, test_db):
        """Returns Celery task state and progress."""
        with patch("app.routers.upload.celery_app") as mock_celery:
            mock_result = MagicMock()
            mock_result.state = "NORMALIZING"
            mock_result.info = {"stage": "normalizing", "progress": 50}
            mock_celery.AsyncResult.return_value = mock_result

            response = authenticated_client.get("/api/import/batches/test-task-123/status")

        assert response.status_code == 200
        data = response.json()
        assert data["task_id"] == "test-task-123"
        assert data["state"] == "NORMALIZING"
        assert data["stage"] == "normalizing"
        assert data["progress"] == 50


class TestUploadAuditTrail:
    """Tests for upload audit logging."""

    def test_upload_logged_in_audit(self, authenticated_client, test_db):
        """Upload action is logged in audit trail."""
        from app.models.audit import AuditLog

        source_resp = authenticated_client.post("/api/sources", json=VALID_SOURCE)
        source_id = source_resp.json()["id"]

        with patch("app.routers.upload.process_upload") as mock_task:
            mock_result = MagicMock()
            mock_result.id = "test-task-id-123"
            mock_task.delay.return_value = mock_result

            authenticated_client.post(
                "/api/import/upload",
                data={"data_source_id": str(source_id)},
                files={"file": ("suppliers.csv", SAMPLE_CSV, "text/csv")},
            )

        # Check audit log
        audit = test_db.query(AuditLog).filter(AuditLog.action == "upload").first()
        assert audit is not None
        assert audit.entity_type == "import_batch"
