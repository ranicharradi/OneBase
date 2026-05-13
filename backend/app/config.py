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
    matching_max_bucket_pairs: int = 500

    # CORS
    cors_origins: str = "http://localhost:5173"

    # Upload directory
    upload_dir: str = "data/uploads"

    # LLM (Google Gemini via google-genai)
    llm_enabled: bool = False
    llm_api_key: str | None = None
    llm_model: str = "gemini-3-flash-preview"
    llm_request_timeout_s: int = 15

    model_config = {"env_file": _env_files(), "extra": "ignore"}


def validate_production_secrets(s: Settings) -> None:
    """Raise RuntimeError if production is running with default secrets."""
    if s.environment == "production" and s.jwt_secret == "change-me-in-production":
        raise RuntimeError(
            "JWT_SECRET must be changed from default in production. "
            "Set a strong, unique JWT_SECRET environment variable."
        )


settings = Settings()
