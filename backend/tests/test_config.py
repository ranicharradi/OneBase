import pytest

from app.config import Settings, validate_production_secrets


def test_validate_production_secrets_raises_in_production():
    """Fail fast when production uses default JWT secret."""
    s = Settings(
        environment="production",
        jwt_secret="change-me-in-production",  # noqa: S106
        database_url="sqlite:///:memory:",
    )
    with pytest.raises(RuntimeError, match="JWT_SECRET must be changed"):
        validate_production_secrets(s)


def test_validate_production_secrets_passes_in_development():
    """Default secret is acceptable in development."""
    s = Settings(
        environment="development",
        jwt_secret="change-me-in-production",  # noqa: S106
        database_url="sqlite:///:memory:",
    )
    validate_production_secrets(s)  # should not raise


def test_validate_production_secrets_passes_with_strong_secret():
    """Production with a real secret should pass."""
    s = Settings(
        environment="production",
        jwt_secret="a-very-strong-and-unique-secret-key-12345",  # noqa: S106
        database_url="sqlite:///:memory:",
    )
    validate_production_secrets(s)  # should not raise


def test_settings_environment_default():
    """Default environment should be 'development'."""
    s = Settings(database_url="sqlite:///:memory:")
    assert s.environment == "development"
