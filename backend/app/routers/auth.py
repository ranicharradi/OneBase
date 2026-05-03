"""Authentication and user management router."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db, require_role
from app.models.enums import UserRole
from app.models.user import User
from app.rate_limit import limiter
from app.schemas.auth import TokenResponse, UserCreate, UserResponse
from app.services.audit import log_action
from app.services.auth import authenticate_user, create_token, hash_password, validate_password_strength

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """Authenticate user and return JWT token."""
    user = authenticate_user(db, form_data.username, form_data.password)
    if user is None:
        log_action(
            db,
            user_id=None,
            action="login_failed",
            entity_type="user",
            details={"username": form_data.username},
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_token(user.username)

    # Audit trail
    log_action(db, user_id=user.id, action="login", entity_type="user", entity_id=user.id)
    db.commit()

    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user."""
    return current_user


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    user_data: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Create a new user (admin only)."""
    # Validate password strength
    error = validate_password_strength(user_data.password)
    if error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=error)

    # Check for duplicate username
    existing = db.query(User).filter(User.username == user_data.username).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already exists",
        )

    new_user = User(
        username=user_data.username,
        password_hash=hash_password(user_data.password),
        is_active=True,
        role=user_data.role.value if user_data.role else "viewer",
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Audit trail
    log_action(
        db,
        user_id=current_user.id,
        action="create_user",
        entity_type="user",
        entity_id=new_user.id,
    )
    db.commit()

    return new_user
