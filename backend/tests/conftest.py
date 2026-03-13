import os

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from app.models.base import Base
from app.models.user import User
from app.dependencies import get_db
from app.main import app


# Use SQLite for fast unit tests, PostgreSQL via TEST_DATABASE_URL if available
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "sqlite:///./test.db")

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in TEST_DATABASE_URL else {},
)

# Enable WAL mode for SQLite to avoid locking issues
if "sqlite" in TEST_DATABASE_URL:
    @event.listens_for(test_engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()

TestSessionLocal = sessionmaker(bind=test_engine)


@pytest.fixture(autouse=True)
def test_db():
    """Create tables before each test, drop after."""
    # Import all models so Base.metadata knows about them
    from app.models import Base  # noqa: F811

    Base.metadata.create_all(bind=test_engine)
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def test_client(test_db):
    """FastAPI test client with DB dependency override."""

    def override_get_db():
        try:
            yield test_db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def authenticated_client(test_client, test_db):
    """Test client with a pre-created user and auth token."""
    from app.services.auth import hash_password, create_token

    user = User(
        username="testuser",
        password_hash=hash_password("testpass123"),
        is_active=True,
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)

    token = create_token(user.username)
    test_client.headers["Authorization"] = f"Bearer {token}"
    return test_client
