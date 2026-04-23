"""Tests for the GET /api/canonical-fields endpoint."""

from fastapi.testclient import TestClient

from app.canonical import CANONICAL_FIELDS


class TestCanonicalFieldsEndpoint:
    def test_requires_authentication(self, test_client: TestClient):
        resp = test_client.get("/api/canonical-fields")
        assert resp.status_code == 401

    def test_returns_all_registry_fields(self, authenticated_client: TestClient):
        resp = authenticated_client.get("/api/canonical-fields")
        assert resp.status_code == 200
        body = resp.json()
        assert "fields" in body
        assert len(body["fields"]) == len(CANONICAL_FIELDS)

    def test_field_shape(self, authenticated_client: TestClient):
        resp = authenticated_client.get("/api/canonical-fields")
        field = resp.json()["fields"][0]
        assert set(field.keys()) == {"key", "label", "required", "dtype", "max_length"}
        assert isinstance(field["key"], str)
        assert isinstance(field["label"], str)
        assert isinstance(field["required"], bool)
        assert isinstance(field["dtype"], str)
        assert isinstance(field["max_length"], int)

    def test_includes_expected_keys_in_registry_order(self, authenticated_client: TestClient):
        resp = authenticated_client.get("/api/canonical-fields")
        keys = [f["key"] for f in resp.json()["fields"]]
        assert keys == [
            "supplier_name",
            "supplier_code",
            "short_name",
            "currency",
            "payment_terms",
            "contact_name",
            "supplier_type",
        ]

    def test_required_flag_matches_registry(self, authenticated_client: TestClient):
        resp = authenticated_client.get("/api/canonical-fields")
        by_key = {f["key"]: f for f in resp.json()["fields"]}
        for field in CANONICAL_FIELDS:
            assert by_key[field.key]["required"] is field.required, f"{field.key}: expected required={field.required}"
