from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    database_url: str = "postgresql://onebase:changeme@postgres:5432/onebase"
    redis_url: str = "redis://redis:6379/0"
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480
    admin_username: Optional[str] = None
    admin_password: Optional[str] = None

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
