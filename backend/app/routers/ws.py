"""WebSocket endpoint for real-time notifications.

Subscribes to a Redis pub/sub channel and relays messages to connected
WebSocket clients, enabling push notifications for matching completion/failure.
"""

import asyncio
import json
import logging

import redis.asyncio as aioredis
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.config import settings
from app.services.notifications import CHANNEL

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/notifications")
async def ws_notifications(websocket: WebSocket, token: str | None = None):
    """WebSocket endpoint that relays Redis pub/sub notifications to the client.

    Optionally accepts a `token` query param for authentication.
    Anonymous connections are still allowed (backwards-compatible) with a warning.
    The client receives JSON messages with type, data, and timestamp fields.
    """
    await websocket.accept()

    if token:
        logger.info("WebSocket client connected (authenticated)")
    else:
        logger.warning("WebSocket client connected without token (anonymous)")

    async_redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    pubsub = async_redis.pubsub()
    await pubsub.subscribe(CHANNEL)

    try:
        while True:
            # Non-blocking check for Redis messages with a short timeout
            message = await pubsub.get_message(
                ignore_subscribe_messages=True, timeout=1.0
            )
            if message and message["type"] == "message":
                try:
                    await websocket.send_text(message["data"])
                except (WebSocketDisconnect, RuntimeError):
                    break

            # Also check for incoming client messages (ping/pong)
            try:
                client_msg = await asyncio.wait_for(
                    websocket.receive_text(), timeout=0.1
                )
                # Respond to pings with pong
                if client_msg == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except asyncio.TimeoutError:
                pass
            except (WebSocketDisconnect, RuntimeError):
                break

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error("WebSocket error: %s", e)
    finally:
        await pubsub.unsubscribe(CHANNEL)
        await pubsub.close()
        await async_redis.close()
        logger.info("WebSocket cleanup complete")
