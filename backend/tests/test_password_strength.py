"""Tests for password strength validation (Task 5.6).

Covers:
- Validator rejects short, no-uppercase, no-lowercase, no-digit passwords
- Validator accepts strong passwords
- Create user endpoint rejects weak passwords
- Change password endpoint rejects weak passwords
"""


class TestPasswordValidator:
    """Unit tests for validate_password_strength()."""

    def test_rejects_short_password(self):
        from app.services.auth import validate_password_strength

        result = validate_password_strength("Ab1")
        assert result is not None
        assert "8 characters" in result

    def test_rejects_no_uppercase(self):
        from app.services.auth import validate_password_strength

        result = validate_password_strength("abcdefg1")
        assert result is not None
        assert "uppercase" in result

    def test_rejects_no_lowercase(self):
        from app.services.auth import validate_password_strength

        result = validate_password_strength("ABCDEFG1")
        assert result is not None
        assert "lowercase" in result

    def test_rejects_no_digit(self):
        from app.services.auth import validate_password_strength

        result = validate_password_strength("Abcdefgh")
        assert result is not None
        assert "digit" in result

    def test_accepts_strong_password(self):
        from app.services.auth import validate_password_strength

        result = validate_password_strength("StrongPass1")
        assert result is None

    def test_accepts_minimum_valid_password(self):
        from app.services.auth import validate_password_strength

        result = validate_password_strength("Abcdefg1")
        assert result is None


class TestCreateUserPasswordStrength:
    """Create user endpoint enforces password strength."""

    def test_create_user_weak_password_rejected(self, authenticated_client):
        response = authenticated_client.post(
            "/api/auth/users",
            json={"username": "weakuser", "password": "weak"},
        )
        assert response.status_code == 422
        assert "password" in response.json()["detail"].lower()

    def test_create_user_strong_password_accepted(self, authenticated_client):
        response = authenticated_client.post(
            "/api/auth/users",
            json={"username": "stronguser", "password": "StrongPass1"},
        )
        assert response.status_code == 201


class TestChangePasswordStrength:
    """Change password endpoint enforces password strength."""

    def test_change_password_weak_rejected(self, authenticated_client, test_db):
        from app.models.user import User

        user = test_db.query(User).filter(User.username == "testuser").first()

        response = authenticated_client.post(
            f"/api/users/{user.id}/change-password",
            json={"new_password": "weak"},
        )
        assert response.status_code == 422
        detail = response.json()["detail"]
        assert "password" in (detail if isinstance(detail, str) else str(detail)).lower()

    def test_change_password_strong_accepted(self, authenticated_client, test_db):
        from app.models.user import User

        user = test_db.query(User).filter(User.username == "testuser").first()

        response = authenticated_client.post(
            f"/api/users/{user.id}/change-password",
            json={"new_password": "NewStrong1"},
        )
        assert response.status_code == 200
