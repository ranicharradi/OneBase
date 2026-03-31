"""Structured logging and request ID middleware."""

import json
import logging
import uuid

from starlette.middleware.base import BaseHTTPMiddleware


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


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Adds a traceable X-Request-ID header to every response."""

    async def dispatch(self, request, call_next):
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


def configure_logging(environment: str) -> None:
    """Apply JSON formatter in production, keep human-readable in dev."""
    if environment == "production":
        handler = logging.StreamHandler()
        handler.setFormatter(JSONFormatter())
        logging.root.handlers = [handler]
        logging.root.setLevel(logging.INFO)
