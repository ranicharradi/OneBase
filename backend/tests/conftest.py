import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.dependencies import get_db
from app.main import app
from app.models.user import User

# Use SQLite in-memory for fast, isolated unit tests.
# StaticPool reuses a single connection so CREATE/DROP TABLE are immediately
# visible across all sessions — eliminates "no such table" races from
# file-based WAL mode. Set TEST_DATABASE_URL to a PostgreSQL URL for
# integration tests.
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "sqlite://")

if "sqlite" in TEST_DATABASE_URL:
    test_engine = create_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
else:
    test_engine = create_engine(TEST_DATABASE_URL)


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
    from app.services.auth import create_token, hash_password

    user = User(
        username="testuser",
        password_hash=hash_password("testpass123"),
        is_active=True,
        role="admin",
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)

    token = create_token(user.username)
    test_client.headers["Authorization"] = f"Bearer {token}"
    return test_client
