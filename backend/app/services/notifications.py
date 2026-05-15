"""Redis pub/sub notification bridge for worker → API → client notification flow.

Publishes notifications to a Redis channel so WebSocket handlers can relay
them to connected frontend clients in real time.
"""

import json
import logging
from datetime import UTC, datetime

import redis

from app.config import settings

logger = logging.getLogger(__name__)

CHANNEL = "onebase:notifications"

# Lazy singleton Redis connection for publishing
_redis_client: redis.Redis | None = None


def _get_redis() -> redis.Redis:
    """Get or create a module-level Redis client (lazy singleton)."""
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(settings.redis_url, decode_responses=True)
    return _redis_client


def publish_notification(notification_type: str, data: dict) -> None:
    """Publish a notification to the Redis pub/sub channel.

    Args:
        notification_type: e.g. 'matching_complete', 'matching_failed'
        data: Notification payload (must be JSON-serializable)
    """
    message = json.dumps(
        {
            "type": notification_type,
            "data": data,
            "timestamp": datetime.now(UTC).isoformat(),
        }
    )
    try:
        client = _get_redis()
        client.publish(CHANNEL, message)
        logger.info("Published notification: %s", notification_type)
    except redis.RedisError as e:
        # Notification failure should never crash the calling task
        logger.warning("Failed to publish notification '%s': %s", notification_type, e)
    except Exception as e:
        logger.warning("Unexpected error publishing notification '%s': %s", notification_type, e)
