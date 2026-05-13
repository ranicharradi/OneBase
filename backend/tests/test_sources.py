"""Tests for data source CRUD endpoints."""

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
    """Tests for PUT /api/sources/{id}."""

    def test_update_source(self, authenticated_client, test_db):
        """Updates source name and description."""
        create_resp = authenticated_client.post("/api/sources", json=VALID_SOURCE)
        source_id = create_resp.json()["id"]

        update_data = {"name": "SAP Export v2", "description": "Updated description"}
        response = authenticated_client.put(f"/api/sources/{source_id}", json=update_data)
        assert response.status_code == 200
        assert response.json()["name"] == "SAP Export v2"
        assert response.json()["description"] == "Updated description"

    def test_update_source_not_found(self, authenticated_client, test_db):
        """Returns 404 for non-existent source."""
        response = authenticated_client.put("/api/sources/999", json={"name": "New Name"})
        assert response.status_code == 404


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
