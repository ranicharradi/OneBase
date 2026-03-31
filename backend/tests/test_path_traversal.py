"""Tests for path traversal prevention in file_ref handling (Task 5.0)."""

import os
from unittest.mock import MagicMock, patch

import pytest

from app.utils.paths import safe_upload_path

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

SAMPLE_CSV = b"\xef\xbb\xbfVendorCode;Name1;ShortName;Currency\nV001;Acme Corp SARL;ACME;EUR\nV002;Beta GmbH;BETA;USD\n"


class TestSafeUploadPath:
    """Unit tests for the safe_upload_path utility."""

    def test_valid_filename(self, tmp_path):
        """Normal filename resolves within upload dir."""
        upload_dir = str(tmp_path / "uploads")
        os.makedirs(upload_dir, exist_ok=True)
        result = safe_upload_path(upload_dir, "abc123_file.csv")
        assert result == os.path.join(os.path.realpath(upload_dir), "abc123_file.csv")

    def test_traversal_etc_passwd(self, tmp_path):
        """../../etc/passwd is rejected."""
        upload_dir = str(tmp_path / "uploads")
        os.makedirs(upload_dir, exist_ok=True)
        with pytest.raises(ValueError, match="Invalid file reference"):
            safe_upload_path(upload_dir, "../../etc/passwd")

    def test_traversal_single_dot_dot(self, tmp_path):
        """../file is rejected."""
        upload_dir = str(tmp_path / "uploads")
        os.makedirs(upload_dir, exist_ok=True)
        with pytest.raises(ValueError, match="Invalid file reference"):
            safe_upload_path(upload_dir, "../secret.csv")

    def test_traversal_normalizes_within_dir(self, tmp_path):
        """../uploads/../uploads/file.csv normalizes to within the upload dir."""
        upload_dir = str(tmp_path / "uploads")
        os.makedirs(upload_dir, exist_ok=True)
        result = safe_upload_path(upload_dir, "../uploads/../uploads/file.csv")
        # After normalization, this is still inside uploads
        assert result.startswith(os.path.realpath(upload_dir) + os.sep)

    def test_traversal_with_null_byte(self, tmp_path):
        """Null byte in filename is rejected (OS-level or raises ValueError)."""
        upload_dir = str(tmp_path / "uploads")
        os.makedirs(upload_dir, exist_ok=True)
        with pytest.raises((ValueError, OSError)):
            safe_upload_path(upload_dir, "file.csv\x00.txt")

    def test_absolute_path_outside(self, tmp_path):
        """Absolute path /etc/passwd is rejected."""
        upload_dir = str(tmp_path / "uploads")
        os.makedirs(upload_dir, exist_ok=True)
        with pytest.raises(ValueError, match="Invalid file reference"):
            safe_upload_path(upload_dir, "/etc/passwd")

    def test_uuid_prefixed_filename(self, tmp_path):
        """UUID-prefixed filenames (normal pattern) work fine."""
        upload_dir = str(tmp_path / "uploads")
        os.makedirs(upload_dir, exist_ok=True)
        result = safe_upload_path(upload_dir, "550e8400-e29b-41d4-a716-446655440000_data.csv")
        assert "550e8400" in result
        assert result.startswith(os.path.realpath(upload_dir) + os.sep)


class TestUploadPathTraversal:
    """Integration tests: file_ref with traversal attempts returns 400."""

    def test_upload_file_ref_traversal_returns_400(self, authenticated_client, test_db):
        """Upload with file_ref=../../etc/passwd returns 400."""
        source_resp = authenticated_client.post("/api/sources", json=VALID_SOURCE)
        source_id = source_resp.json()["id"]

        with patch("app.routers.upload.process_upload"):
            response = authenticated_client.post(
                "/api/import/upload",
                data={
                    "data_source_id": str(source_id),
                    "file_ref": "../../etc/passwd",
                },
            )

        assert response.status_code == 400
        assert "Invalid file reference" in response.json()["detail"]

    def test_upload_file_ref_absolute_path_returns_400(self, authenticated_client, test_db):
        """Upload with file_ref=/etc/passwd returns 400."""
        source_resp = authenticated_client.post("/api/sources", json=VALID_SOURCE)
        source_id = source_resp.json()["id"]

        with patch("app.routers.upload.process_upload"):
            response = authenticated_client.post(
                "/api/import/upload",
                data={
                    "data_source_id": str(source_id),
                    "file_ref": "/etc/passwd",
                },
            )

        assert response.status_code == 400
        assert "Invalid file reference" in response.json()["detail"]

    def test_upload_valid_file_ref_works(self, authenticated_client, test_db):
        """Upload with a valid file_ref that exists works normally."""
        source_resp = authenticated_client.post("/api/sources", json=VALID_SOURCE)
        source_id = source_resp.json()["id"]

        # Create a real file in upload dir
        os.makedirs("data/uploads", exist_ok=True)
        test_ref = "test-uuid_valid.csv"
        test_path = os.path.join("data", "uploads", test_ref)
        with open(test_path, "wb") as f:
            f.write(SAMPLE_CSV)

        try:
            with patch("app.routers.upload.process_upload") as mock_task:
                mock_result = MagicMock()
                mock_result.id = "test-task-id"
                mock_task.delay.return_value = mock_result

                response = authenticated_client.post(
                    "/api/import/upload",
                    data={
                        "data_source_id": str(source_id),
                        "file_ref": test_ref,
                    },
                )

            assert response.status_code == 201
        finally:
            if os.path.exists(test_path):
                os.unlink(test_path)


class TestSourcesGuessPathTraversal:
    """Integration tests: file_ref traversal in sources guess-mapping returns 400."""

    def test_guess_mapping_traversal_returns_400(self, authenticated_client, test_db):
        """guess-mapping with file_ref=../../etc/passwd returns 400."""
        response = authenticated_client.post(
            "/api/sources/guess-mapping",
            data={"file_ref": "../../etc/passwd"},
        )
        assert response.status_code == 400
        assert "Invalid file reference" in response.json()["detail"]

    def test_guess_mapping_absolute_path_returns_400(self, authenticated_client, test_db):
        """guess-mapping with file_ref=/etc/passwd returns 400."""
        response = authenticated_client.post(
            "/api/sources/guess-mapping",
            data={"file_ref": "/etc/passwd"},
        )
        assert response.status_code == 400
        assert "Invalid file reference" in response.json()["detail"]
