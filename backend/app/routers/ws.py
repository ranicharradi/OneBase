"""WebSocket endpoint for real-time notifications.

Subscribes to a Redis pub/sub channel and relays messages to connected
WebSocket clients, enabling push notifications for matching completion/failure.
"""

import asyncio
import json
import logging

import jwt as pyjwt
import redis.asyncio as aioredis
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, WebSocketException, status

from app.config import settings
from app.services.notifications import CHANNEL

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/notifications")
async def ws_notifications(websocket: WebSocket, token: str | None = None):
    """WebSocket endpoint that relays Redis pub/sub notifications to the client.

    Requires a valid JWT token via the `token` query parameter.
    Rejects connections before accept if token is missing or invalid.
    """
    if not token:
        raise WebSocketException(
            code=status.WS_1008_POLICY_VIOLATION,
            reason="Missing authentication token",
        )

    try:
        payload = pyjwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        username = payload.get("sub")
        if not username:
            raise pyjwt.PyJWTError("Missing subject")
    except pyjwt.PyJWTError as exc:
        raise WebSocketException(
            code=status.WS_1008_POLICY_VIOLATION,
            reason="Invalid authentication token",
        ) from exc

    await websocket.accept()
    logger.info("WebSocket client connected: %s", username)

    async_redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    pubsub = async_redis.pubsub()
    await pubsub.subscribe(CHANNEL)

    try:
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message and message["type"] == "message":
                try:
                    await websocket.send_text(message["data"])
                except (WebSocketDisconnect, RuntimeError):
                    break

            try:
                client_msg = await asyncio.wait_for(websocket.receive_text(), timeout=0.1)
                if client_msg == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except TimeoutError:
                pass
            except (WebSocketDisconnect, RuntimeError):
                break

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected: %s", username)
    except Exception as e:
        logger.error("WebSocket error: %s", e)
    finally:
        await pubsub.unsubscribe(CHANNEL)
        await pubsub.close()
        await async_redis.close()
        logger.info("WebSocket cleanup complete for %s", username)
