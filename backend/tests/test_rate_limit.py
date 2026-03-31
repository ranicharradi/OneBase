"""Tests for rate limiting on auth endpoints (Task 5.1)."""


class TestLoginRateLimit:
    """Tests for rate limiting on POST /api/auth/login."""

    def test_normal_login_works(self, test_client, test_db):
        """A single login attempt works normally."""
        from app.models.user import User
        from app.services.auth import hash_password

        user = User(
            username="ratelimituser",
            password_hash=hash_password("TestPass123"),
            is_active=True,
            role="viewer",
        )
        test_db.add(user)
        test_db.commit()

        response = test_client.post(
            "/api/auth/login",
            data={"username": "ratelimituser", "password": "TestPass123"},
        )
        assert response.status_code == 200
        assert "access_token" in response.json()

    def test_rate_limit_returns_429_after_5_attempts(self, test_client, test_db):
        """6th login attempt within rate window returns 429."""
        for i in range(5):
            response = test_client.post(
                "/api/auth/login",
                data={"username": "nonexistent", "password": "wrong"},
            )
            assert response.status_code in (401, 429), f"Attempt {i + 1}: got {response.status_code}"

        # 6th attempt should be rate limited
        response = test_client.post(
            "/api/auth/login",
            data={"username": "nonexistent", "password": "wrong"},
        )
        assert response.status_code == 429
