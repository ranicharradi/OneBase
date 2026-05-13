"""Tests for /api/ask. SQL execution is mocked because the view only exists on Postgres."""

from unittest.mock import patch

from app.config import settings
from app.services import llm as llm_service


def test_ask_disabled_returns_503(authenticated_client):
    resp = authenticated_client.post("/api/ask", json={"question": "anything"})
    assert resp.status_code == 503


def test_ask_rejects_unsafe_sql(authenticated_client, monkeypatch):
    monkeypatch.setattr(settings, "llm_enabled", True)
    monkeypatch.setattr(settings, "llm_api_key", "x")

    def fake_complete(prompt, fmt):
        return fmt(sql="DELETE FROM users")

    monkeypatch.setattr(llm_service, "complete_structured", fake_complete)

    resp = authenticated_client.post("/api/ask", json={"question": "delete users"})
    assert resp.status_code == 422


def test_ask_happy_path(authenticated_client, monkeypatch):
    monkeypatch.setattr(settings, "llm_enabled", True)
    monkeypatch.setattr(settings, "llm_api_key", "x")

    def fake_complete(prompt, fmt):
        return fmt(sql="SELECT id FROM v_unified_records_for_ask")

    monkeypatch.setattr(llm_service, "complete_structured", fake_complete)

    with patch("app.routers.ask._execute_safe_sql") as exec_mock:
        exec_mock.return_value = (["id"], [[1], [2]])
        resp = authenticated_client.post("/api/ask", json={"question": "list ids"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["columns"] == ["id"]
    assert body["rows"] == [[1], [2]]
    assert "LIMIT 200" in body["sql"].upper()
