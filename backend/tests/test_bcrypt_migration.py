"""Tests for bcrypt password hashing migration (Task 5.5).

Covers:
- New passwords are hashed with bcrypt
- Legacy PBKDF2 hashes still verify correctly
- Silent migration from PBKDF2 to bcrypt on login
- Pre-hash handles passwords > 72 bytes
"""


class TestBcryptHashing:
    """New passwords use bcrypt."""

    def test_hash_password_returns_bcrypt_format(self):
        """hash_password() produces a bcrypt hash starting with $2b$."""
        from app.services.auth import hash_password

        hashed = hash_password("TestPass123")
        assert hashed.startswith("$2b$"), f"Expected bcrypt hash, got: {hashed[:20]}"

    def test_verify_password_bcrypt(self):
        """verify_password() validates a bcrypt-hashed password."""
        from app.services.auth import hash_password, verify_password

        hashed = hash_password("MySecurePass1")
        assert verify_password("MySecurePass1", hashed) is True
        assert verify_password("WrongPassword", hashed) is False

    def test_prehash_handles_long_passwords(self):
        """Passwords longer than 72 bytes are safely handled via pre-hashing."""
        from app.services.auth import hash_password, verify_password

        long_password = "A" * 200
        hashed = hash_password(long_password)
        assert hashed.startswith("$2b$")
        assert verify_password(long_password, hashed) is True
        assert verify_password("A" * 199, hashed) is False


class TestLegacyPBKDF2Compat:
    """Legacy PBKDF2 hashes still work."""

    @staticmethod
    def _make_legacy_hash(password: str) -> str:
        """Create a PBKDF2 hash using the old algorithm."""
        import hashlib
        import secrets

        salt = secrets.token_hex(16)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
        return f"{salt}${dk.hex()}"

    def test_verify_legacy_pbkdf2_hash(self):
        """verify_password() correctly validates legacy PBKDF2 hashes."""
        from app.services.auth import verify_password

        legacy_hash = self._make_legacy_hash("OldPassword99")
        assert verify_password("OldPassword99", legacy_hash) is True
        assert verify_password("WrongPassword", legacy_hash) is False

    def test_legacy_hash_detection(self):
        """Legacy PBKDF2 hashes contain '$' but don't start with '$2'."""
        legacy_hash = self._make_legacy_hash("anything")
        assert "$" in legacy_hash
        assert not legacy_hash.startswith("$2")


class TestSilentMigration:
    """authenticate_user() silently re-hashes PBKDF2 to bcrypt on login."""

    def test_legacy_user_migrated_on_login(self, test_db):
        """User with PBKDF2 hash gets bcrypt hash after successful login."""
        from app.models.user import User
        from app.services.auth import authenticate_user

        legacy_hash = TestLegacyPBKDF2Compat._make_legacy_hash("MyPass123")
        user = User(username="legacyuser", password_hash=legacy_hash, is_active=True)
        test_db.add(user)
        test_db.commit()

        assert not user.password_hash.startswith("$2")

        result = authenticate_user(test_db, "legacyuser", "MyPass123")
        assert result is not None
        assert result.password_hash.startswith("$2b$"), "Hash should be migrated to bcrypt"

    def test_bcrypt_user_not_re_hashed(self, test_db):
        """User with bcrypt hash keeps the same hash after login."""
        from app.models.user import User
        from app.services.auth import authenticate_user, hash_password

        bcrypt_hash = hash_password("NewPass456")
        user = User(username="modernuser", password_hash=bcrypt_hash, is_active=True)
        test_db.add(user)
        test_db.commit()

        original_hash = user.password_hash
        result = authenticate_user(test_db, "modernuser", "NewPass456")
        assert result is not None
        assert result.password_hash == original_hash, "bcrypt hash should not change"

    def test_login_integration_with_legacy_hash(self, test_client, test_db):
        """Full login flow works with a legacy PBKDF2 hash and migrates it."""
        from app.models.user import User

        legacy_hash = TestLegacyPBKDF2Compat._make_legacy_hash("IntegrationPass1")
        user = User(username="intuser", password_hash=legacy_hash, is_active=True)
        test_db.add(user)
        test_db.commit()

        response = test_client.post(
            "/api/auth/login",
            data={"username": "intuser", "password": "IntegrationPass1"},
        )
        assert response.status_code == 200
        assert "access_token" in response.json()

        test_db.refresh(user)
        assert user.password_hash.startswith("$2b$"), "Hash should be migrated after login"
