"""Tests for WebSocket user existence verification (Task 5.9)."""

import json
from unittest.mock import MagicMock, patch

import pytest
from starlette.websockets import WebSocketDisconnect


def _make_mock_redis():
    """Build a mock aioredis instance with async pub/sub methods."""
    mock_redis = MagicMock()
    mock_pubsub = MagicMock()

    async def mock_subscribe(*args):
        pass

    async def mock_unsubscribe(*args):
        pass

    async def mock_close():
        pass

    async def mock_get_message(**kwargs):
        return None

    mock_pubsub.subscribe = mock_subscribe
    mock_pubsub.unsubscribe = mock_unsubscribe
    mock_pubsub.close = mock_close
    mock_pubsub.get_message = mock_get_message
    mock_redis.pubsub.return_value = mock_pubsub
    mock_redis.close = mock_close
    return mock_redis


class TestWebSocketUserVerification:
    """WebSocket must reject connections from deleted or inactive users."""

    def test_deleted_user_with_valid_jwt_rejected(self, test_client, test_db):
        """A valid JWT for a user that no longer exists is rejected."""
        from app.services.auth import create_token

        token = create_token("deleted_user")

        with (
            patch("app.routers.ws.SessionLocal", return_value=test_db),
            pytest.raises(WebSocketDisconnect),
            test_client.websocket_connect(f"/ws/notifications?token={token}"),
        ):
            pass

    def test_inactive_user_with_valid_jwt_rejected(self, test_client, test_db):
        """A valid JWT for an inactive user is rejected."""
        from app.models.user import User
        from app.services.auth import create_token, hash_password

        user = User(
            username="inactive_ws_user",
            password_hash=hash_password("pass123"),
            is_active=False,
        )
        test_db.add(user)
        test_db.commit()

        token = create_token("inactive_ws_user")

        with (
            patch("app.routers.ws.SessionLocal", return_value=test_db),
            pytest.raises(WebSocketDisconnect),
            test_client.websocket_connect(f"/ws/notifications?token={token}"),
        ):
            pass

    def test_active_user_with_valid_jwt_accepted(self, test_client, test_db):
        """A valid JWT for an active user is accepted."""
        from app.models.user import User
        from app.services.auth import create_token, hash_password

        user = User(
            username="active_ws_user",
            password_hash=hash_password("pass123"),
            is_active=True,
        )
        test_db.add(user)
        test_db.commit()

        token = create_token("active_ws_user")

        with (
            patch("app.routers.ws.SessionLocal", return_value=test_db),
            patch("app.routers.ws.aioredis") as mock_aioredis,
        ):
            mock_aioredis.from_url.return_value = _make_mock_redis()

            with test_client.websocket_connect(f"/ws/notifications?token={token}") as ws:
                ws.send_text("ping")
                response = ws.receive_text()
                data = json.loads(response)
                assert data["type"] == "pong"
