"""Structured logging and request ID middleware."""

import json
import logging
import uuid

from starlette.datastructures import MutableHeaders


class JSONFormatter(logging.Formatter):
    """Produces one JSON object per log line for production log aggregation."""

    def format(self, record):
        log_data = {
            "timestamp": self.formatTime(record),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_data)


class RequestIDMiddleware:
    """Adds a traceable X-Request-ID header to every HTTP response (pure ASGI)."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Read request ID from incoming headers, or generate one
        request_headers = dict(scope.get("headers", []))
        request_id = request_headers.get(b"x-request-id", b"").decode() or str(uuid.uuid4())

        async def send_with_request_id(message):
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers.append("X-Request-ID", request_id)
            await send(message)

        await self.app(scope, receive, send_with_request_id)


def configure_logging(environment: str) -> None:
    """Apply JSON formatter in production, keep human-readable in dev."""
    if environment == "production":
        handler = logging.StreamHandler()
        handler.setFormatter(JSONFormatter())
        logging.root.handlers = [handler]
        logging.root.setLevel(logging.INFO)
