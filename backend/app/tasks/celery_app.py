from celery import Celery

from app.config import settings

celery_app = Celery(
    "onebase",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    broker_transport_options={"visibility_timeout": 7200},
    task_acks_late=True,
    task_reject_on_worker_lost=True,
)

celery_app.conf.include = ["app.tasks.ingestion", "app.tasks.matching"]
