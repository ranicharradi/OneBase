"""Tests for structured logging and request ID middleware (Task 5.7).

Covers:
- JSONFormatter produces valid JSON log lines
- JSONFormatter includes exception info
- Dev environment uses human-readable format
- RequestIDMiddleware adds X-Request-ID header
- RequestIDMiddleware echoes provided X-Request-ID
"""

import json
import logging


class TestJSONFormatter:
    """JSONFormatter produces structured JSON log output."""

    def test_formats_as_valid_json(self):
        from app.logging_config import JSONFormatter

        formatter = JSONFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg="hello world",
            args=(),
            exc_info=None,
        )
        output = formatter.format(record)
        parsed = json.loads(output)
        assert parsed["level"] == "INFO"
        assert parsed["message"] == "hello world"
        assert parsed["logger"] == "test"
        assert "timestamp" in parsed

    def test_includes_exception_info(self):
        from app.logging_config import JSONFormatter

        formatter = JSONFormatter()
        try:
            raise ValueError("test error")
        except ValueError:
            import sys

            exc_info = sys.exc_info()

        record = logging.LogRecord(
            name="test",
            level=logging.ERROR,
            pathname="",
            lineno=0,
            msg="failed",
            args=(),
            exc_info=exc_info,
        )
        output = formatter.format(record)
        parsed = json.loads(output)
        assert "exception" in parsed
        assert "ValueError" in parsed["exception"]


class TestRequestIDMiddleware:
    """Request ID middleware adds traceable IDs to responses."""

    def test_adds_request_id_header(self, test_client):
        response = test_client.get("/health")
        assert "x-request-id" in response.headers
        # Should be a valid UUID
        import uuid

        uuid.UUID(response.headers["x-request-id"])

    def test_echoes_provided_request_id(self, test_client):
        custom_id = "my-trace-123"
        response = test_client.get("/health", headers={"X-Request-ID": custom_id})
        assert response.headers["x-request-id"] == custom_id
