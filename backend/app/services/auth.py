"""Authentication and user management service."""

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

import jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.models.user import User


def hash_password(password: str) -> str:
    """Hash a password using PBKDF2-SHA256."""
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
    return f"{salt}${dk.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against a PBKDF2-SHA256 hash."""
    try:
        salt, stored_hash = password_hash.split("$", 1)
    except ValueError:
        return False
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
    return hmac.compare_digest(dk.hex(), stored_hash)


def create_token(username: str) -> str:
    """Create a JWT access token for a given username."""
    expire = datetime.now(UTC) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {
        "sub": username,
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT token. Raises jwt.PyJWTError on failure."""
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


def authenticate_user(db: Session, username: str, password: str) -> User | None:
    """Authenticate a user by username and password. Returns User or None."""
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        return None
    if not verify_password(password, user.password_hash):
        return None
    if not user.is_active:
        return None
    return user


def create_initial_user(db: Session) -> None:
    """Create admin user from config if configured and not existing."""
    if not settings.admin_username or not settings.admin_password:
        return
    existing = db.query(User).filter(User.username == settings.admin_username).first()
    if existing:
        return
    admin = User(
        username=settings.admin_username,
        password_hash=hash_password(settings.admin_password),
        is_active=True,
        role="admin",
    )
    db.add(admin)
