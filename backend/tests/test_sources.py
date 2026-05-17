"""Tests for data source CRUD endpoints."""

from app.models.user import User
from app.services.auth import create_token, hash_password


def _auth_header(username: str) -> dict:
    return {"Authorization": f"Bearer {create_token(username)}"}


def _create_user_with_role(db, username: str, role: str) -> User:
    user = User(
        username=username,
        password_hash=hash_password("testpass123"),
        is_active=True,
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


VALID_SOURCE = {
    "name": "SAP Export",
    "description": "SAP supplier export",
    "file_format": "csv",
    "delimiter": ";",
    "type": "supplier",
    "column_mapping": {
        "supplier_name": "Name1",
        "short_name": "ShortName",
        "currency": "Currency",
    },
}


class TestCreateSource:
    """Tests for POST /api/sources."""

    def test_create_source(self, authenticated_client, test_db):
        """Creates a data source with column_mapping."""
        response = authenticated_client.post("/api/sources", json=VALID_SOURCE)
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "SAP Export"
        assert data["column_mapping"]["supplier_name"] == "Name1"
        assert data["column_mapping"]["short_name"] == "ShortName"
        assert "id" in data
        assert "created_at" in data

    def test_create_source_duplicate_name(self, authenticated_client, test_db):
        """Returns 409 for duplicate source name."""
        authenticated_client.post("/api/sources", json=VALID_SOURCE)
        response = authenticated_client.post("/api/sources", json=VALID_SOURCE)
        assert response.status_code == 409

    def test_create_source_requires_auth(self, test_client, test_db):
        """Returns 401 without auth token."""
        response = test_client.post("/api/sources", json=VALID_SOURCE)
        assert response.status_code == 401

    def test_create_source_requires_required_field_mapping(self, authenticated_client, test_db):
        """Rejects mappings that omit required fields for the selected record type."""
        source = VALID_SOURCE | {
            "name": "Missing Supplier Name",
            "column_mapping": {"short_name": "ShortName"},
        }
        response = authenticated_client.post("/api/sources", json=source)
        assert response.status_code == 400
        detail = response.json()["detail"]
        assert "required" in detail.lower()
        assert "supplier_name" in detail


class TestListSources:
    """Tests for GET /api/sources."""

    def test_list_sources(self, authenticated_client, test_db):
        """Returns list of all sources."""
        authenticated_client.post("/api/sources", json=VALID_SOURCE)
        source2 = VALID_SOURCE.copy()
        source2["name"] = "Oracle Export"
        authenticated_client.post("/api/sources", json=source2)

        response = authenticated_client.get("/api/sources")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2


class TestGetSource:
    """Tests for GET /api/sources/{id}."""

    def test_get_source(self, authenticated_client, test_db):
        """Returns single source by ID."""
        create_resp = authenticated_client.post("/api/sources", json=VALID_SOURCE)
        source_id = create_resp.json()["id"]

        response = authenticated_client.get(f"/api/sources/{source_id}")
        assert response.status_code == 200
        assert response.json()["name"] == "SAP Export"

    def test_get_source_not_found(self, authenticated_client, test_db):
        """Returns 404 for non-existent source."""
        response = authenticated_client.get("/api/sources/999")
        assert response.status_code == 404


class TestUpdateSource:
    """Tests for removed PUT /api/sources/{id} update endpoint."""

    def test_update_source_not_allowed(self, authenticated_client, test_db):
        """Source editing is intentionally not exposed."""
        create_resp = authenticated_client.post("/api/sources", json=VALID_SOURCE)
        source_id = create_resp.json()["id"]

        update_data = {"name": "SAP Export v2", "description": "Updated description"}
        response = authenticated_client.put(f"/api/sources/{source_id}", json=update_data)
        assert response.status_code == 405


class TestDeleteSource:
    """Tests for DELETE /api/sources/{id}."""

    def test_delete_source(self, authenticated_client, test_db):
        """Deletes source and returns 204."""
        create_resp = authenticated_client.post("/api/sources", json=VALID_SOURCE)
        source_id = create_resp.json()["id"]

        response = authenticated_client.delete(f"/api/sources/{source_id}")
        assert response.status_code == 204

        # Verify it's gone
        response = authenticated_client.get(f"/api/sources/{source_id}")
        assert response.status_code == 404

    def test_delete_source_not_found(self, authenticated_client, test_db):
        """Returns 404 for non-existent source."""
        response = authenticated_client.delete("/api/sources/999")
        assert response.status_code == 404


def test_suggest_mapping_disabled_returns_503(authenticated_client, test_db):
    resp = authenticated_client.post(
        "/api/sources/suggest-mapping",
        json={
            "record_type": "supplier",
            "headers": ["Nom", "Email"],
            "sample_rows": [{"Nom": "Acme", "Email": "a@b.com"}],
        },
    )
    assert resp.status_code == 503


def test_suggest_mapping_happy_path(authenticated_client, test_db, monkeypatch):
    from pydantic import BaseModel

    from app.config import settings
    from app.services import llm as llm_service

    monkeypatch.setattr(settings, "llm_enabled", True)
    monkeypatch.setattr(settings, "llm_api_key", "test")

    class _FakeSuggestion(BaseModel):
        mapping: dict[str, str | None]

    def fake_complete(prompt, output_format):
        return output_format(mapping={"Nom": "name", "Email": "email"})

    monkeypatch.setattr(llm_service, "complete_structured", fake_complete)

    resp = authenticated_client.post(
        "/api/sources/suggest-mapping",
        json={
            "record_type": "supplier",
            "headers": ["Nom", "Email"],
            "sample_rows": [{"Nom": "Acme", "Email": "a@b.com"}],
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["suggestions"]["Nom"] == "name"
    assert body["suggestions"]["Email"] == "email"
    assert body["model"]


class TestDetectHeaders:
    """Tests for POST /api/sources/detect-headers."""

    def test_detect_headers_csv_semicolon(self, authenticated_client, test_db):
        content = b"code;name;city\n001;Acme;Paris\n"
        response = authenticated_client.post(
            "/api/sources/detect-headers",
            files={"file": ("vendors.csv", content, "text/csv")},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["columns"] == ["code", "name", "city"]
        assert body["delimiter"] == ";"
        assert body["format"] == "csv"

    def test_detect_headers_csv_comma(self, authenticated_client, test_db):
        content = b"code,name,city\n001,Acme,Paris\n"
        response = authenticated_client.post(
            "/api/sources/detect-headers",
            files={"file": ("vendors.csv", content, "text/csv")},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["columns"] == ["code", "name", "city"]
        assert body["delimiter"] == ","

    def test_detect_headers_xlsx(self, authenticated_client, test_db):
        from io import BytesIO

        import openpyxl

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["code", "name", "city"])
        ws.append(["001", "Acme", "Paris"])
        buf = BytesIO()
        wb.save(buf)

        response = authenticated_client.post(
            "/api/sources/detect-headers",
            files={
                "file": (
                    "vendors.xlsx",
                    buf.getvalue(),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                ),
            },
        )
        assert response.status_code == 200
        body = response.json()
        assert body["columns"] == ["code", "name", "city"]
        assert body["delimiter"] is None
        assert body["format"] == "xlsx"

    def test_detect_headers_unsupported_extension(self, authenticated_client, test_db):
        response = authenticated_client.post(
            "/api/sources/detect-headers",
            files={"file": ("vendors.pdf", b"%PDF-1.4 fake", "application/pdf")},
        )
        assert response.status_code == 400
        detail = response.json()["detail"].lower()
        assert "csv" in detail and "xlsx" in detail

    def test_detect_headers_corrupted_xlsx(self, authenticated_client, test_db):
        response = authenticated_client.post(
            "/api/sources/detect-headers",
            files={"file": ("vendors.xlsx", b"not a real workbook", "application/octet-stream")},
        )
        assert response.status_code == 400
        assert "excel" in response.json()["detail"].lower()

    def test_detect_headers_requires_auth(self, test_client, test_db):
        response = test_client.post(
            "/api/sources/detect-headers",
            files={"file": ("vendors.csv", b"code;name\n001;Acme\n", "text/csv")},
        )
        assert response.status_code == 401

    def test_detect_headers_requires_admin(self, test_client, test_db):
        _create_user_with_role(test_db, "source-viewer", "viewer")
        response = test_client.post(
            "/api/sources/detect-headers",
            files={"file": ("vendors.csv", b"code;name\n001;Acme\n", "text/csv")},
            headers=_auth_header("source-viewer"),
        )
        assert response.status_code == 403

    def test_detect_headers_rejects_non_utf8_csv(self, authenticated_client, test_db):
        response = authenticated_client.post(
            "/api/sources/detect-headers",
            files={"file": ("vendors.csv", b"code;name\n001;Caf\xe9 Corp\n", "text/csv")},
        )
        assert response.status_code == 400
        assert "utf-8" in response.json()["detail"].lower()
