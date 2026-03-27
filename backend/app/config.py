import os
from pathlib import Path

from pydantic_settings import BaseSettings

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent  # backend/../
_PROFILE = os.getenv("ENV_PROFILE", "").lower()


def _env_files() -> list[str]:
    """Return env files to load, in priority order (last wins)."""
    base = _PROJECT_ROOT / ".env"
    profile = _PROJECT_ROOT / f".env.{_PROFILE}" if _PROFILE else None
    files = []
    if base.exists():
        files.append(str(base))
    if profile and profile.exists():
        files.append(str(profile))
    return files


class Settings(BaseSettings):
    database_url: str = "postgresql://onebase:changeme@postgres:5432/onebase"
    redis_url: str = "redis://redis:6379/0"
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480
    admin_username: str | None = None
    admin_password: str | None = None
    environment: str = "development"

    # Matching engine
    matching_confidence_threshold: float = 0.45
    matching_blocking_k: int = 20
    matching_max_cluster_size: int = 50
    matching_weight_jaro_winkler: float = 0.30
    matching_weight_token_jaccard: float = 0.20
    matching_weight_embedding_cosine: float = 0.25
    matching_weight_short_name: float = 0.10
    matching_weight_currency: float = 0.05
    matching_weight_contact: float = 0.10

    model_config = {"env_file": _env_files(), "extra": "ignore"}


def validate_production_secrets(s: Settings) -> None:
    """Raise RuntimeError if production is running with default secrets."""
    if s.environment == "production" and s.jwt_secret == "change-me-in-production":
        raise RuntimeError(
            "JWT_SECRET must be changed from default in production. "
            "Set a strong, unique JWT_SECRET environment variable."
        )


settings = Settings()
