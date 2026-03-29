# Phase 3 Sub-project 1: Backend RBAC + User Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three-tier role-based access control (admin/reviewer/viewer) and complete user management CRUD to the FastAPI backend.

**Architecture:** Add `UserRole` enum and `role` column to User model. Create a `require_role()` closure-based FastAPI dependency. Gate all mutating endpoints per the role matrix. Add five new user management endpoints with guards and audit logging.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy, Alembic, Pydantic v2, pytest, SQLite (tests)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/app/models/enums.py` | Modify | Add `UserRole` StrEnum |
| `backend/app/models/user.py` | Modify | Add `role` column |
| `backend/alembic/versions/008_add_user_role.py` | Create | Migration for role column |
| `backend/app/schemas/auth.py` | Modify | Add `role` to schemas, add `UserUpdate`, `PasswordChange` |
| `backend/app/dependencies.py` | Modify | Add `require_role()` dependency |
| `backend/app/routers/auth.py` | Modify | Gate `create_user` to ADMIN, add role field |
| `backend/app/routers/users.py` | Modify | Add 5 new endpoints |
| `backend/app/routers/sources.py` | Modify | Gate mutating endpoints to ADMIN |
| `backend/app/routers/upload.py` | Modify | Gate upload/delete to ADMIN |
| `backend/app/routers/matching.py` | Modify | Gate retrain/train to ADMIN |
| `backend/app/routers/review.py` | Modify | Gate actions to ADMIN+REVIEWER |
| `backend/app/routers/unified.py` | Modify | Gate promote/bulk-promote to ADMIN+REVIEWER |
| `backend/app/services/auth.py` | Modify | Set role on initial admin user |
| `backend/tests/conftest.py` | Modify | Add role to test fixtures |
| `backend/tests/test_rbac.py` | Create | All RBAC and user management tests |

---

### Task 1: Add UserRole enum and role column to User model

**Files:**
- Modify: `backend/app/models/enums.py`
- Modify: `backend/app/models/user.py`

- [ ] **Step 1: Add UserRole to enums.py**

Add after the `CandidateStatus` class at the end of `backend/app/models/enums.py`:

```python
class UserRole(StrEnum):
    ADMIN = "admin"
    REVIEWER = "reviewer"
    VIEWER = "viewer"
```

- [ ] **Step 2: Add role column to User model**

In `backend/app/models/user.py`, add the import and column:

```python
from sqlalchemy import Boolean, Column, DateTime, Integer, String, func

from app.models.base import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(100), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    role = Column(String(20), default="viewer", nullable=False)
    created_at = Column(DateTime, server_default=func.now())
```

- [ ] **Step 3: Verify models load without error**

Run: `cd /home/rani/OneBase/backend && source .venv/bin/activate && python -c "from app.models.user import User; from app.models.enums import UserRole; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/enums.py backend/app/models/user.py
git commit -m "feat: add UserRole enum and role column to User model"
```

---

### Task 2: Create Alembic migration for role column

**Files:**
- Create: `backend/alembic/versions/008_add_user_role.py`

- [ ] **Step 1: Generate the migration**

```bash
cd /home/rani/OneBase/backend && source .venv/bin/activate && ENV_PROFILE=dev alembic revision --autogenerate -m "add_user_role"
```

- [ ] **Step 2: Edit the generated migration**

Open the generated file in `backend/alembic/versions/` (it will have a hash prefix and `_add_user_role.py` suffix). Replace the `upgrade()` and `downgrade()` functions with:

```python
def upgrade():
    op.add_column("users", sa.Column("role", sa.String(20), nullable=False, server_default="viewer"))
    # Backfill: first user (seed admin) gets admin role
    op.execute("UPDATE users SET role = 'admin' WHERE username = (SELECT username FROM users ORDER BY id LIMIT 1)")


def downgrade():
    op.drop_column("users", "role")
```

- [ ] **Step 3: Verify the migration runs**

```bash
cd /home/rani/OneBase/backend && source .venv/bin/activate && ENV_PROFILE=dev alembic upgrade head
```

Expected: Migration applies cleanly, no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/
git commit -m "feat: add migration 008 for user role column"
```

---

### Task 3: Update schemas and auth service

**Files:**
- Modify: `backend/app/schemas/auth.py`
- Modify: `backend/app/services/auth.py`

- [ ] **Step 1: Update schemas**

Replace the entire content of `backend/app/schemas/auth.py`:

```python
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
```

- [ ] **Step 2: Update create_initial_user to set admin role**

In `backend/app/services/auth.py`, update the `create_initial_user` function to set `role="admin"`:

```python
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
```

- [ ] **Step 3: Verify import works**

Run: `cd /home/rani/OneBase/backend && source .venv/bin/activate && python -c "from app.schemas.auth import UserCreate, UserUpdate, PasswordChange, UserResponse; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/auth.py backend/app/services/auth.py
git commit -m "feat: update auth schemas with role field and UserUpdate/PasswordChange"
```

---

### Task 4: Add require_role() dependency

**Files:**
- Modify: `backend/app/dependencies.py`
- Test: `backend/tests/test_rbac.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_rbac.py`:

```python
"""Tests for role-based access control."""

import pytest
from fastapi import HTTPException

from app.models.enums import UserRole
from app.models.user import User
from app.services.auth import hash_password


class TestRequireRole:
    """Tests for the require_role() dependency."""

    def _make_user(self, db, username="testuser", role="admin"):
        user = User(
            username=username,
            password_hash=hash_password("testpass123"),
            is_active=True,
            role=role,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    def test_admin_passes_admin_only(self, test_db):
        from app.dependencies import require_role

        user = self._make_user(test_db, role="admin")
        dep = require_role(UserRole.ADMIN)
        result = dep(current_user=user)
        assert result.id == user.id

    def test_viewer_rejected_from_admin_only(self, test_db):
        from app.dependencies import require_role

        user = self._make_user(test_db, role="viewer")
        dep = require_role(UserRole.ADMIN)
        with pytest.raises(HTTPException) as exc_info:
            dep(current_user=user)
        assert exc_info.value.status_code == 403

    def test_reviewer_passes_reviewer_and_admin(self, test_db):
        from app.dependencies import require_role

        user = self._make_user(test_db, role="reviewer")
        dep = require_role(UserRole.REVIEWER, UserRole.ADMIN)
        result = dep(current_user=user)
        assert result.id == user.id

    def test_viewer_rejected_from_reviewer_and_admin(self, test_db):
        from app.dependencies import require_role

        user = self._make_user(test_db, role="viewer")
        dep = require_role(UserRole.REVIEWER, UserRole.ADMIN)
        with pytest.raises(HTTPException) as exc_info:
            dep(current_user=user)
        assert exc_info.value.status_code == 403
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/rani/OneBase/backend && source .venv/bin/activate && python -m pytest tests/test_rbac.py -v`
Expected: FAIL — `require_role` not found or doesn't exist yet.

- [ ] **Step 3: Implement require_role()**

Add to the end of `backend/app/dependencies.py`:

```python
from app.models.enums import UserRole


def require_role(*allowed_roles: UserRole):
    """Return a FastAPI dependency that checks the current user's role."""

    def dependency(current_user: User = Depends(get_current_user)):
        if current_user.role not in [r.value for r in allowed_roles]:
            raise HTTPException(
                status_code=403,
                detail=f"Role '{current_user.role}' not authorized. Required: {', '.join(r.value for r in allowed_roles)}",
            )
        return current_user

    return dependency
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/rani/OneBase/backend && source .venv/bin/activate && python -m pytest tests/test_rbac.py -v`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/dependencies.py backend/tests/test_rbac.py
git commit -m "feat: add require_role() dependency with tests"
```

---

### Task 5: Gate all mutating endpoints by role

**Files:**
- Modify: `backend/app/routers/sources.py`
- Modify: `backend/app/routers/upload.py`
- Modify: `backend/app/routers/matching.py`
- Modify: `backend/app/routers/review.py`
- Modify: `backend/app/routers/unified.py`
- Modify: `backend/app/routers/auth.py`
- Test: `backend/tests/test_rbac.py`

- [ ] **Step 1: Write integration tests for role gating**

Append to `backend/tests/test_rbac.py`:

```python
from app.services.auth import create_token


def _auth_header(username: str) -> dict:
    return {"Authorization": f"Bearer {create_token(username)}"}


def _create_user_with_role(db, username, role):
    user = User(
        username=username,
        password_hash=hash_password("testpass123"),
        is_active=True,
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


class TestEndpointRoleGating:
    """Integration tests for role gating on endpoints."""

    def test_viewer_cannot_create_source(self, test_client, test_db):
        _create_user_with_role(test_db, "viewer1", "viewer")
        resp = test_client.post(
            "/api/sources",
            json={"name": "Test", "column_mapping": {"supplier_name": "Name"}},
            headers=_auth_header("viewer1"),
        )
        assert resp.status_code == 403

    def test_admin_can_create_source(self, test_client, test_db):
        _create_user_with_role(test_db, "admin1", "admin")
        resp = test_client.post(
            "/api/sources",
            json={"name": "Test", "column_mapping": {"supplier_name": "Name"}},
            headers=_auth_header("admin1"),
        )
        assert resp.status_code in (201, 200)

    def test_viewer_cannot_trigger_retrain(self, test_client, test_db):
        _create_user_with_role(test_db, "viewer2", "viewer")
        resp = test_client.post("/api/matching/retrain", headers=_auth_header("viewer2"))
        assert resp.status_code == 403

    def test_viewer_cannot_reject_candidate(self, test_client, test_db):
        _create_user_with_role(test_db, "viewer3", "viewer")
        resp = test_client.post(
            "/api/review/candidates/999/reject",
            headers=_auth_header("viewer3"),
        )
        assert resp.status_code == 403

    def test_reviewer_can_reject_candidate(self, test_client, test_db):
        _create_user_with_role(test_db, "reviewer1", "reviewer")
        resp = test_client.post(
            "/api/review/candidates/999/reject",
            headers=_auth_header("reviewer1"),
        )
        # 404 is fine — means role check passed, candidate just doesn't exist
        assert resp.status_code in (404, 400)

    def test_viewer_cannot_promote_singleton(self, test_client, test_db):
        _create_user_with_role(test_db, "viewer4", "viewer")
        resp = test_client.post(
            "/api/unified/singletons/999/promote",
            headers=_auth_header("viewer4"),
        )
        assert resp.status_code == 403

    def test_viewer_cannot_upload(self, test_client, test_db):
        _create_user_with_role(test_db, "viewer5", "viewer")
        resp = test_client.post(
            "/api/import/upload",
            data={"data_source_id": "1"},
            headers=_auth_header("viewer5"),
        )
        assert resp.status_code == 403

    def test_viewer_cannot_create_user(self, test_client, test_db):
        _create_user_with_role(test_db, "viewer6", "viewer")
        resp = test_client.post(
            "/api/auth/users",
            json={"username": "newuser", "password": "password123"},
            headers=_auth_header("viewer6"),
        )
        assert resp.status_code == 403
```

- [ ] **Step 2: Run tests to verify they fail (endpoints not yet gated)**

Run: `cd /home/rani/OneBase/backend && source .venv/bin/activate && python -m pytest tests/test_rbac.py::TestEndpointRoleGating -v`
Expected: Most tests FAIL — viewers can still access mutating endpoints.

- [ ] **Step 3: Gate sources.py**

In `backend/app/routers/sources.py`, add import and replace `get_current_user` with `require_role` on mutating endpoints:

Add to imports:
```python
from app.dependencies import get_current_user, get_db, require_role
from app.models.enums import SupplierStatus, UserRole
```

Replace `current_user: User = Depends(get_current_user)` with `current_user: User = Depends(require_role(UserRole.ADMIN))` on these functions:
- `create_data_source` (POST `""`)
- `update_data_source` (PUT `"/{source_id}"`)
- `delete_data_source` (DELETE `"/{source_id}"`)
- `detect_columns_no_source` (POST `"/detect-columns"`)
- `match_source` (POST `"/match-source"`)
- `guess_mapping` (POST `"/guess-mapping"`)
- `detect_source_columns` (POST `"/{source_id}/detect-columns"`)

Leave GET endpoints (`list_data_sources`, `get_data_source`) using `get_current_user`.

- [ ] **Step 4: Gate upload.py**

In `backend/app/routers/upload.py`, add import:
```python
from app.dependencies import get_current_user, get_db, require_role
from app.models.enums import BatchStatus, UserRole
```

Replace `current_user: User = Depends(get_current_user)` with `current_user: User = Depends(require_role(UserRole.ADMIN))` on:
- `upload_file` (POST `"/upload"`)
- `delete_batch` (DELETE `"/batches/{batch_id}"`)

Leave GET endpoints (`list_batches`, `get_task_status`) using `get_current_user`.

- [ ] **Step 5: Gate matching.py**

In `backend/app/routers/matching.py`, add import:
```python
from app.dependencies import get_current_user, get_db, require_role
from app.models.enums import UserRole
```

Replace `current_user: User = Depends(get_current_user)` with `current_user: User = Depends(require_role(UserRole.ADMIN))` on:
- `trigger_retrain` (POST `"/retrain"`)
- `train_ml_model` (POST `"/train-model"`)

Leave GET endpoints (`list_groups`, `list_candidates`) using `get_current_user`.

- [ ] **Step 6: Gate review.py**

In `backend/app/routers/review.py`, add import:
```python
from app.dependencies import get_current_user, get_db, require_role
from app.models.enums import CandidateStatus, UserRole
```

Replace `current_user: User = Depends(get_current_user)` with `current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.REVIEWER))` on:
- `merge_candidate` (POST `"/candidates/{candidate_id}/merge"`)
- `reject_match` (POST `"/candidates/{candidate_id}/reject"`)
- `skip_match` (POST `"/candidates/{candidate_id}/skip"`)

Leave GET endpoints (`get_review_queue`, `get_match_detail`, `get_review_stats`) using `get_current_user`.

- [ ] **Step 7: Gate unified.py**

In `backend/app/routers/unified.py`, add import:
```python
from app.dependencies import get_current_user, get_db, require_role
from app.models.enums import BatchStatus, CandidateStatus, SupplierStatus, UserRole
```

Replace `current_user: User = Depends(get_current_user)` with `current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.REVIEWER))` on:
- `promote_singleton` (POST `"/singletons/{supplier_id}/promote"`)
- `bulk_promote_singletons` (POST `"/singletons/bulk-promote"`)

Leave GET endpoints (`list_unified_suppliers`, `get_unified_supplier`, `list_singletons`, `export_unified_csv`, `get_dashboard`) using `get_current_user`.

- [ ] **Step 8: Gate auth.py create_user**

In `backend/app/routers/auth.py`, add import:
```python
from app.dependencies import get_current_user, get_db, require_role
from app.models.enums import UserRole
```

On `create_user`, replace `current_user: User = Depends(get_current_user)` with `current_user: User = Depends(require_role(UserRole.ADMIN))`.

Also update the function body to use the role from the schema:

```python
    new_user = User(
        username=user_data.username,
        password_hash=hash_password(user_data.password),
        is_active=True,
        role=user_data.role.value if user_data.role else "viewer",
    )
```

- [ ] **Step 9: Run role gating tests**

Run: `cd /home/rani/OneBase/backend && source .venv/bin/activate && python -m pytest tests/test_rbac.py -v`
Expected: All tests PASS.

- [ ] **Step 10: Commit**

```bash
git add backend/app/routers/sources.py backend/app/routers/upload.py backend/app/routers/matching.py backend/app/routers/review.py backend/app/routers/unified.py backend/app/routers/auth.py backend/tests/test_rbac.py
git commit -m "feat: gate all mutating endpoints by role"
```

---

### Task 6: Update existing test fixtures with role

**Files:**
- Modify: `backend/tests/conftest.py`

- [ ] **Step 1: Add role to authenticated_client fixture**

In `backend/tests/conftest.py`, update the `authenticated_client` fixture to set `role="admin"`:

```python
@pytest.fixture
def authenticated_client(test_client, test_db):
    """Test client with a pre-created admin user and auth token."""
    from app.services.auth import create_token, hash_password

    user = User(
        username="testuser",
        password_hash=hash_password("testpass123"),
        is_active=True,
        role="admin",
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)

    token = create_token(user.username)
    test_client.headers["Authorization"] = f"Bearer {token}"
    return test_client
```

- [ ] **Step 2: Run the full test suite**

Run: `cd /home/rani/OneBase/backend && source .venv/bin/activate && python -m pytest -x -q`
Expected: All existing tests PASS (they use `authenticated_client` which now has admin role).

- [ ] **Step 3: Commit**

```bash
git add backend/tests/conftest.py
git commit -m "fix: add admin role to test fixtures for role-gated endpoints"
```

---

### Task 7: Add user management endpoints

**Files:**
- Modify: `backend/app/routers/users.py`
- Test: `backend/tests/test_rbac.py`

- [ ] **Step 1: Write tests for user management endpoints**

Append to `backend/tests/test_rbac.py`:

```python
class TestUserManagement:
    """Tests for user CRUD endpoints."""

    def _setup_admin(self, db):
        admin = User(
            username="admin",
            password_hash=hash_password("adminpass"),
            is_active=True,
            role="admin",
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
        return admin

    def test_get_user_by_id(self, test_client, test_db):
        admin = self._setup_admin(test_db)
        resp = test_client.get(
            f"/api/users/{admin.id}",
            headers=_auth_header("admin"),
        )
        assert resp.status_code == 200
        assert resp.json()["username"] == "admin"
        assert resp.json()["role"] == "admin"

    def test_update_user_role(self, test_client, test_db):
        admin = self._setup_admin(test_db)
        viewer = User(
            username="viewer",
            password_hash=hash_password("viewerpass"),
            is_active=True,
            role="viewer",
        )
        test_db.add(viewer)
        test_db.commit()
        test_db.refresh(viewer)

        resp = test_client.put(
            f"/api/users/{viewer.id}",
            json={"role": "reviewer"},
            headers=_auth_header("admin"),
        )
        assert resp.status_code == 200
        assert resp.json()["role"] == "reviewer"

    def test_cannot_demote_last_admin(self, test_client, test_db):
        admin = self._setup_admin(test_db)
        resp = test_client.put(
            f"/api/users/{admin.id}",
            json={"role": "viewer"},
            headers=_auth_header("admin"),
        )
        assert resp.status_code == 400
        assert "last admin" in resp.json()["detail"].lower()

    def test_delete_user(self, test_client, test_db):
        admin = self._setup_admin(test_db)
        victim = User(
            username="victim",
            password_hash=hash_password("pass"),
            is_active=True,
            role="viewer",
        )
        test_db.add(victim)
        test_db.commit()
        test_db.refresh(victim)

        resp = test_client.delete(
            f"/api/users/{victim.id}",
            headers=_auth_header("admin"),
        )
        assert resp.status_code == 204

    def test_cannot_delete_self(self, test_client, test_db):
        admin = self._setup_admin(test_db)
        resp = test_client.delete(
            f"/api/users/{admin.id}",
            headers=_auth_header("admin"),
        )
        assert resp.status_code == 400

    def test_toggle_active(self, test_client, test_db):
        admin = self._setup_admin(test_db)
        target = User(
            username="target",
            password_hash=hash_password("pass"),
            is_active=True,
            role="viewer",
        )
        test_db.add(target)
        test_db.commit()
        test_db.refresh(target)

        resp = test_client.post(
            f"/api/users/{target.id}/toggle-active",
            headers=_auth_header("admin"),
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False

    def test_cannot_toggle_self(self, test_client, test_db):
        admin = self._setup_admin(test_db)
        resp = test_client.post(
            f"/api/users/{admin.id}/toggle-active",
            headers=_auth_header("admin"),
        )
        assert resp.status_code == 400

    def test_change_own_password(self, test_client, test_db):
        admin = self._setup_admin(test_db)
        resp = test_client.post(
            f"/api/users/{admin.id}/change-password",
            json={"new_password": "newpassword123"},
            headers=_auth_header("admin"),
        )
        assert resp.status_code == 200

    def test_viewer_cannot_change_other_password(self, test_client, test_db):
        self._setup_admin(test_db)
        viewer = User(
            username="viewer",
            password_hash=hash_password("pass"),
            is_active=True,
            role="viewer",
        )
        test_db.add(viewer)
        test_db.commit()
        test_db.refresh(viewer)

        admin_user = test_db.query(User).filter(User.username == "admin").first()
        resp = test_client.post(
            f"/api/users/{admin_user.id}/change-password",
            json={"new_password": "hackerpass1"},
            headers=_auth_header("viewer"),
        )
        assert resp.status_code == 403

    def test_password_too_short(self, test_client, test_db):
        admin = self._setup_admin(test_db)
        resp = test_client.post(
            f"/api/users/{admin.id}/change-password",
            json={"new_password": "short"},
            headers=_auth_header("admin"),
        )
        assert resp.status_code == 422
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/rani/OneBase/backend && source .venv/bin/activate && python -m pytest tests/test_rbac.py::TestUserManagement -v`
Expected: FAIL — endpoints don't exist yet.

- [ ] **Step 3: Implement user management endpoints**

Replace `backend/app/routers/users.py` with:

```python
"""User management router."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db, require_role
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.auth import PasswordChange, UserResponse, UserUpdate
from app.services.audit import log_action
from app.services.auth import hash_password

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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

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
        # Check uniqueness
        existing = db.query(User).filter(User.username == update.username, User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")
        target.username = update.username

    if update.role is not None:
        target.role = update.role.value

    log_action(
        db,
        user_id=current_user.id,
        action="user_updated",
        entity_type="user",
        entity_id=target.id,
        details={
            "changes": {
                k: v for k, v in {
                    "username": update.username,
                    "role": f"{old_role} -> {update.role.value}" if update.role else None,
                }.items() if v is not None
            }
        },
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
    """Delete a user (admin only). Cannot delete yourself or the last admin."""
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if target.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete yourself")

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


@router.post("/{user_id}/toggle-active", response_model=UserResponse)
def toggle_user_active(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Toggle a user's active status (admin only). Cannot deactivate yourself."""
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if target.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot deactivate yourself")

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


@router.post("/{user_id}/change-password", response_model=UserResponse)
def change_password(
    user_id: int,
    body: PasswordChange,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change a user's password. Admin can change anyone's; users can change their own."""
    if current_user.role != "admin" and current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can change other users' passwords",
        )

    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/rani/OneBase/backend && source .venv/bin/activate && python -m pytest tests/test_rbac.py::TestUserManagement -v`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/users.py backend/tests/test_rbac.py
git commit -m "feat: add user management endpoints (CRUD, toggle-active, change-password)"
```

---

### Task 8: Verify audit log user_id=None handling

**Files:**
- Test: `backend/tests/test_rbac.py`

- [ ] **Step 1: Write the test**

Append to `backend/tests/test_rbac.py`:

```python
from app.models.audit import AuditLog
from app.services.audit import log_action


class TestAuditNullUserId:
    """Verify system audit entries with user_id=None."""

    def test_system_audit_entry_with_null_user(self, test_db):
        entry = log_action(
            test_db,
            user_id=None,
            action="system_test",
            entity_type="test",
            entity_id=1,
            details={"source": "celery"},
        )
        test_db.commit()

        loaded = test_db.get(AuditLog, entry.id)
        assert loaded is not None
        assert loaded.user_id is None
        assert loaded.action == "system_test"
```

- [ ] **Step 2: Run the test**

Run: `cd /home/rani/OneBase/backend && source .venv/bin/activate && python -m pytest tests/test_rbac.py::TestAuditNullUserId -v`
Expected: PASS (model already has `nullable=True`).

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_rbac.py
git commit -m "test: verify audit log allows user_id=None for system actions"
```

---

### Task 9: Run full test suite and fix any breakage

**Files:**
- Potentially modify any test file that breaks

- [ ] **Step 1: Run the full test suite**

Run: `cd /home/rani/OneBase/backend && source .venv/bin/activate && python -m pytest -x -q`
Expected: All tests PASS. If any fail, they likely need `role="admin"` added to their user fixtures.

- [ ] **Step 2: Fix any failures**

For any test that creates a `User` directly and then hits a now-gated endpoint, add `role="admin"` (or appropriate role) to the User constructor.

Common pattern — find lines like:
```python
user = User(username="...", password_hash=hash_password("..."), is_active=True)
```
And add `role="admin"`:
```python
user = User(username="...", password_hash=hash_password("..."), is_active=True, role="admin")
```

- [ ] **Step 3: Run full suite again**

Run: `cd /home/rani/OneBase/backend && source .venv/bin/activate && python -m pytest -q`
Expected: All tests PASS.

- [ ] **Step 4: Commit if there were fixes**

```bash
git add -A backend/tests/
git commit -m "fix: update test fixtures with role field for RBAC compatibility"
```
