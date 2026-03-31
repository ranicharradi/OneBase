"""Authentication and user management service."""

import base64
import hashlib
import hmac
import re
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.models.user import User

MIN_PASSWORD_LENGTH = 8


def validate_password_strength(password: str) -> str | None:
    """Returns an error message if password is too weak, None if OK."""
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"Password must be at least {MIN_PASSWORD_LENGTH} characters"
    if not re.search(r"[A-Z]", password):
        return "Password must contain at least one uppercase letter"
    if not re.search(r"[a-z]", password):
        return "Password must contain at least one lowercase letter"
    if not re.search(r"\d", password):
        return "Password must contain at least one digit"
    return None


def _prehash(password: str) -> bytes:
    """Pre-hash with SHA256+base64 to safely handle passwords > 72 bytes.
    bcrypt 5.0+ raises ValueError for passwords exceeding 72 bytes."""
    return base64.b64encode(hashlib.sha256(password.encode()).digest())


def hash_password(password: str) -> str:
    """Hash a password using bcrypt with SHA256 pre-hashing."""
    return bcrypt.hashpw(_prehash(password), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against a bcrypt or legacy PBKDF2-SHA256 hash."""
    if "$" in password_hash and not password_hash.startswith("$2"):
        # Legacy PBKDF2 hash: format is "salt$hash" (salt is hex, never starts with $2)
        try:
            salt, stored_hash = password_hash.split("$", 1)
        except ValueError:
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
        return hmac.compare_digest(dk.hex(), stored_hash)
    # bcrypt hash: starts with "$2b$" or "$2a$"
    return bcrypt.checkpw(_prehash(password), password_hash.encode())


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
    # Silently migrate legacy PBKDF2 hashes to bcrypt on successful login
    if not user.password_hash.startswith("$2"):
        user.password_hash = hash_password(password)
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
