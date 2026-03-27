"""Pydantic v2 schemas for authentication and user management."""

from datetime import datetime

from pydantic import BaseModel


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    is_active: bool
    created_at: datetime | None = None

    model_config = {"from_attributes": True}
