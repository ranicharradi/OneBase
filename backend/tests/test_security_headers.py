"""Tests for security headers middleware (Task 5.3) and request ID (Task 5.7)."""

EXPECTED_SECURITY_HEADERS = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "x-xss-protection": "0",
}


class TestSecurityHeaders:
    """Every API response must include security headers."""

    def test_health_has_security_headers(self, test_client, test_db):
        """GET /health returns all 5 security headers."""
        response = test_client.get("/health")
        assert response.status_code == 200
        for header, value in EXPECTED_SECURITY_HEADERS.items():
            assert response.headers.get(header) == value, (
                f"Missing or wrong header: {header}={response.headers.get(header)}"
            )

    def test_auth_login_has_security_headers(self, test_client, test_db):
        """POST /api/auth/login response has security headers (even on 401)."""
        response = test_client.post(
            "/api/auth/login",
            data={"username": "x", "password": "y"},
        )
        for header in EXPECTED_SECURITY_HEADERS:
            assert header in response.headers, f"Missing header: {header}"
