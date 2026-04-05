from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings

_engine_kwargs: dict = {"pool_pre_ping": True}

# Add connection pool settings for PostgreSQL (not applicable to SQLite)
if settings.database_url.startswith("postgresql"):
    _engine_kwargs.update(
        pool_size=10,
        max_overflow=20,
        pool_recycle=1800,
    )

engine = create_engine(settings.database_url, **_engine_kwargs)

SessionLocal = sessionmaker(bind=engine)


@contextmanager
def get_task_session():
    """Context manager for Celery task database sessions.

    Guarantees session.close() even if an exception occurs
    between session creation and the task's try block.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
