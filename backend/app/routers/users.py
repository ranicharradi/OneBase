"""User management router."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db, require_role
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.auth import PasswordChange, UserResponse, UserUpdate
from app.services.audit import log_action
from app.services.auth import hash_password, validate_password_strength

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=list[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all users (requires authentication)."""
    users = db.query(User).order_by(User.id).all()
    return users


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single user by ID."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return user


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    update: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Update a user's username and/or role (admin only)."""
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Last admin protection
    if update.role and update.role.value != "admin" and target.role == "admin":
        admin_count = db.query(User).filter(User.role == "admin", User.is_active.is_(True)).count()
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot demote the last admin",
            )

    old_role = target.role
    if update.username is not None:
        existing = db.query(User).filter(User.username == update.username, User.id != user_id).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username already exists",
            )
        target.username = update.username

    if update.role is not None:
        target.role = update.role.value

    changes = {}
    if update.username is not None:
        changes["username"] = update.username
    if update.role is not None:
        changes["role"] = f"{old_role} -> {update.role.value}"
    log_action(
        db,
        user_id=current_user.id,
        action="user_updated",
        entity_type="user",
        entity_id=target.id,
        details={"changes": changes},
    )
    db.commit()
    db.refresh(target)
    return target


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Delete a user (admin only)."""
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if target.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete yourself",
        )

    if target.role == "admin":
        admin_count = db.query(User).filter(User.role == "admin", User.is_active.is_(True)).count()
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete the last admin",
            )

    log_action(
        db,
        user_id=current_user.id,
        action="user_deleted",
        entity_type="user",
        entity_id=target.id,
        details={"username": target.username},
    )
    db.delete(target)
    db.commit()


@router.post(
    "/{user_id}/toggle-active",
    response_model=UserResponse,
)
def toggle_user_active(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Toggle a user's active status (admin only)."""
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if target.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate yourself",
        )

    target.is_active = not target.is_active

    log_action(
        db,
        user_id=current_user.id,
        action="user_toggled_active",
        entity_type="user",
        entity_id=target.id,
        details={"is_active": target.is_active},
    )
    db.commit()
    db.refresh(target)
    return target


@router.post(
    "/{user_id}/change-password",
    response_model=UserResponse,
)
def change_password(
    user_id: int,
    body: PasswordChange,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change a user's password."""
    if current_user.role != "admin" and current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can change other users' passwords",
        )

    # Validate password strength
    error = validate_password_strength(body.new_password)
    if error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=error)

    target = db.get(User, user_id)
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    target.password_hash = hash_password(body.new_password)

    log_action(
        db,
        user_id=current_user.id,
        action="user_password_changed",
        entity_type="user",
        entity_id=target.id,
    )
    db.commit()
    db.refresh(target)
    return target
