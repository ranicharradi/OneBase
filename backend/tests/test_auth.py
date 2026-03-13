"""Tests for JWT authentication and user management."""
import pytest


def test_login_success(test_client, test_db):
    """POST /api/auth/login with valid credentials returns 200 + JWT token."""
    from app.services.auth import hash_password
    from app.models.user import User

    user = User(
        username="admin",
        password_hash=hash_password("secret123"),
        is_active=True,
    )
    test_db.add(user)
    test_db.commit()

    response = test_client.post(
        "/api/auth/login",
        data={"username": "admin", "password": "secret123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_login_invalid_credentials(test_client, test_db):
    """POST /api/auth/login with invalid credentials returns 401."""
    from app.services.auth import hash_password
    from app.models.user import User

    user = User(
        username="admin",
        password_hash=hash_password("secret123"),
        is_active=True,
    )
    test_db.add(user)
    test_db.commit()

    response = test_client.post(
        "/api/auth/login",
        data={"username": "admin", "password": "wrongpassword"},
    )
    assert response.status_code == 401


def test_login_nonexistent_user(test_client, test_db):
    """POST /api/auth/login with nonexistent user returns 401."""
    response = test_client.post(
        "/api/auth/login",
        data={"username": "nobody", "password": "whatever"},
    )
    assert response.status_code == 401


def test_me_with_valid_token(authenticated_client):
    """GET /api/auth/me with valid token returns current user."""
    response = authenticated_client.get("/api/auth/me")
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "testuser"
    assert "id" in data
    assert "is_active" in data


def test_me_without_token(test_client):
    """GET /api/auth/me without token returns 401."""
    response = test_client.get("/api/auth/me")
    assert response.status_code == 401


def test_create_user_success(authenticated_client, test_db):
    """POST /api/auth/users creates new user (requires auth)."""
    response = authenticated_client.post(
        "/api/auth/users",
        json={"username": "newuser", "password": "newpass123"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["username"] == "newuser"
    assert data["is_active"] is True
    assert "id" in data
    # Password hash should NOT be in response
    assert "password_hash" not in data


def test_create_user_duplicate(authenticated_client, test_db):
    """POST /api/auth/users with duplicate username returns 409."""
    # First creation should succeed
    authenticated_client.post(
        "/api/auth/users",
        json={"username": "dupuser", "password": "pass123456"},
    )
    # Second creation with same username should fail
    response = authenticated_client.post(
        "/api/auth/users",
        json={"username": "dupuser", "password": "pass789012"},
    )
    assert response.status_code == 409


def test_create_user_unauthenticated(test_client):
    """POST /api/auth/users without auth returns 401."""
    response = test_client.post(
        "/api/auth/users",
        json={"username": "newuser", "password": "newpass123"},
    )
    assert response.status_code == 401


def test_list_users(authenticated_client, test_db):
    """GET /api/users lists all users (requires auth)."""
    response = authenticated_client.get("/api/users")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1  # At least the test user
    assert data[0]["username"] == "testuser"


def test_list_users_unauthenticated(test_client):
    """GET /api/users without auth returns 401."""
    response = test_client.get("/api/users")
    assert response.status_code == 401
