"""Pydantic v2 schemas for authentication and user management."""

from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import UserRole


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    username: str
    password: str
    role: UserRole = UserRole.VIEWER


class UserUpdate(BaseModel):
    username: str | None = None
    role: UserRole | None = None


class PasswordChange(BaseModel):
    new_password: str = Field(min_length=8)


class UserResponse(BaseModel):
    id: int
    username: str
    is_active: bool
    role: str
    created_at: datetime | None = None

    model_config = {"from_attributes": True}
