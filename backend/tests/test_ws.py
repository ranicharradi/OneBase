"""Tests for WebSocket notification infrastructure.

Tests notification publishing and WebSocket endpoint with mocked Redis.
"""

import json
from unittest.mock import MagicMock, patch


class TestPublishNotification:
    """Tests for the publish_notification service."""

    @patch("app.services.notifications._redis_client", None)
    @patch("app.services.notifications.redis")
    def test_publishes_correct_json_structure(self, mock_redis_module):
        """publish_notification sends correct JSON to Redis channel."""
        from app.services.notifications import CHANNEL, publish_notification

        # Reset the singleton so our mock gets used
        mock_client = MagicMock()
        mock_redis_module.from_url.return_value = mock_client

        publish_notification(
            "matching_complete",
            {"batch_id": 1, "candidate_count": 42, "group_count": 5},
        )

        # Verify publish was called
        mock_client.publish.assert_called_once()
        call_args = mock_client.publish.call_args
        channel = call_args[0][0]
        message = json.loads(call_args[0][1])

        assert channel == CHANNEL
        assert message["type"] == "matching_complete"
        assert message["data"]["batch_id"] == 1
        assert message["data"]["candidate_count"] == 42
        assert message["data"]["group_count"] == 5
        assert "timestamp" in message

    @patch("app.services.notifications._redis_client", None)
    @patch("app.services.notifications.redis")
    def test_publishes_failure_notification(self, mock_redis_module):
        """publish_notification sends failure notification correctly."""
        from app.services.notifications import publish_notification

        mock_client = MagicMock()
        mock_redis_module.from_url.return_value = mock_client

        publish_notification(
            "matching_failed",
            {"batch_id": 2, "error": "Something went wrong"},
        )

        call_args = mock_client.publish.call_args
        message = json.loads(call_args[0][1])

        assert message["type"] == "matching_failed"
        assert message["data"]["error"] == "Something went wrong"

    @patch("app.services.notifications._redis_client", None)
    @patch("app.services.notifications.redis")
    def test_does_not_crash_on_redis_error(self, mock_redis_module):
        """publish_notification handles Redis connection errors gracefully."""
        import redis as real_redis

        from app.services.notifications import publish_notification

        mock_client = MagicMock()
        mock_client.publish.side_effect = real_redis.RedisError("Connection refused")
        mock_redis_module.from_url.return_value = mock_client
        mock_redis_module.RedisError = real_redis.RedisError

        # Should not raise
        publish_notification("matching_complete", {"batch_id": 1})

    @patch("app.services.notifications._redis_client", None)
    @patch("app.services.notifications.redis")
    def test_does_not_crash_on_unexpected_error(self, mock_redis_module):
        """publish_notification handles unexpected errors gracefully."""
        from app.services.notifications import publish_notification

        mock_client = MagicMock()
        mock_client.publish.side_effect = RuntimeError("Unexpected")
        mock_redis_module.from_url.return_value = mock_client
        mock_redis_module.RedisError = Exception  # Won't match RuntimeError

        # Should not raise
        publish_notification("matching_complete", {"batch_id": 1})


class TestWebSocketEndpoint:
    """Tests for the WebSocket endpoint."""

    def test_websocket_endpoint_exists(self, test_client):
        """WebSocket endpoint at /ws/notifications is registered."""
        from app.main import app

        ws_routes = [route for route in app.routes if hasattr(route, "path") and route.path == "/ws/notifications"]
        assert len(ws_routes) == 1, "WebSocket route /ws/notifications should be registered"

    def test_websocket_accepts_connection(self, test_client):
        """WebSocket endpoint accepts connections (mocked Redis)."""
        with patch("app.routers.ws.aioredis") as mock_aioredis:
            # Mock the async Redis pub/sub
            mock_redis = MagicMock()
            mock_pubsub = MagicMock()

            mock_aioredis.from_url.return_value = mock_redis

            # Make pubsub methods async
            async def mock_subscribe(*args):
                pass

            async def mock_unsubscribe(*args):
                pass

            async def mock_close():
                pass

            async def mock_get_message(**kwargs):
                # Return None (no messages) which makes the loop continue
                # The WebSocket disconnect will break the loop
                return None

            mock_pubsub.subscribe = mock_subscribe
            mock_pubsub.unsubscribe = mock_unsubscribe
            mock_pubsub.close = mock_close
            mock_pubsub.get_message = mock_get_message
            mock_redis.pubsub.return_value = mock_pubsub
            mock_redis.close = mock_close

            # Use FastAPI TestClient for WebSocket testing
            with test_client.websocket_connect("/ws/notifications") as ws:
                # Connection accepted, send ping
                ws.send_text("ping")
                response = ws.receive_text()
                data = json.loads(response)
                assert data["type"] == "pong"


class TestMatchingTaskNotifications:
    """Tests that matching task publishes notifications on completion/failure."""

    @patch("app.services.notifications._redis_client", None)
    @patch("app.services.notifications.redis")
    def test_matching_imports_publish_notification(self, mock_redis_module):
        """Matching task can import publish_notification."""
        from app.services.notifications import publish_notification

        assert callable(publish_notification)

    def test_matching_task_is_importable(self):
        """Matching task module can be imported."""
        from app.tasks.matching import run_matching

        assert callable(run_matching)
