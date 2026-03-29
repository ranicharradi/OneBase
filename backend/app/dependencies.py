from collections.abc import Generator

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.enums import UserRole
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Decode JWT token and return the current authenticated user."""
    import jwt as pyjwt

    from app.services.auth import decode_token

    try:
        payload = decode_token(token)
        username: str | None = payload.get("sub")
        if username is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
            )
    except pyjwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        ) from None

    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return user


def require_role(*allowed_roles: UserRole):
    """Return a FastAPI dependency that checks the current user's role."""

    def dependency(current_user: User = Depends(get_current_user)):
        if current_user.role not in [r.value for r in allowed_roles]:
            required = ", ".join(r.value for r in allowed_roles)
            raise HTTPException(
                status_code=403,
                detail=f"Role '{current_user.role}' not authorized. Required: {required}",
            )
        return current_user

    return dependency
