"""Tests for CORS configuration from environment (Task 5.2)."""


class TestCorsConfig:
    """CORS origins should come from settings, not hardcoded."""

    def test_cors_origins_from_settings(self):
        """Settings has cors_origins attribute with a default."""
        from app.config import Settings

        s = Settings(
            cors_origins="http://localhost:5173,http://localhost:3000",
            _env_file=None,
        )
        origins = [o.strip() for o in s.cors_origins.split(",")]
        assert "http://localhost:5173" in origins
        assert "http://localhost:3000" in origins

    def test_cors_origins_single_value(self):
        """Settings works with a single origin."""
        from app.config import Settings

        s = Settings(cors_origins="http://myserver:8080", _env_file=None)
        origins = [o.strip() for o in s.cors_origins.split(",")]
        assert origins == ["http://myserver:8080"]

    def test_cors_header_present(self, test_client, test_db):
        """Health endpoint returns CORS headers for configured origin."""
        response = test_client.get(
            "/health",
            headers={"Origin": "http://localhost:5173"},
        )
        assert response.status_code == 200
        assert "access-control-allow-origin" in response.headers
