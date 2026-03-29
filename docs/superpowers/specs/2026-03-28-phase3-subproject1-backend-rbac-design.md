# Phase 3 Sub-project 1: Backend RBAC + User Management

> **Scope:** Tasks 3.1–3.7 from phase-3-feature-completion.md
> **Goal:** Add role-based access control and complete user management API so every endpoint has appropriate permission gating.
> **Depends on:** Phase 2 complete (status enums in `app/models/enums.py`, WebSocket auth).

---

## 1. Data Model & Migration

### 1.1 UserRole enum

Add to `app/models/enums.py`:

```python
class UserRole(StrEnum):
    ADMIN = "admin"
    REVIEWER = "reviewer"
    VIEWER = "viewer"
```

Three roles. No "manager" — the spec's role matrix has exactly three tiers of access.

### 1.2 User model change

Add to `app/models/user.py`:

```python
role = Column(String(20), default="viewer", nullable=False)
```

`String(20)` rather than PG ENUM type — simpler migrations if roles change later. Validation happens at the Pydantic schema layer.

### 1.3 Migration: `008_add_user_role`

```python
def upgrade():
    op.add_column("users", sa.Column("role", sa.String(20), nullable=False, server_default="viewer"))
    # Backfill: first user (seed admin) gets admin role
    op.execute("UPDATE users SET role = 'admin' WHERE username = (SELECT username FROM users ORDER BY id LIMIT 1)")

def downgrade():
    op.drop_column("users", "role")
```

### 1.4 Schema updates (`app/schemas/auth.py`)

- `UserResponse`: add `role: str`
- `UserCreate`: add `role: UserRole = UserRole.VIEWER` (optional, defaults to viewer)
- New `UserUpdate`: `username: str | None = None`, `role: UserRole | None = None`
- New `PasswordChange`: `new_password: str` (with min-length validation)

**Acceptance criteria:**
- Migration runs cleanly on existing database
- Existing admin user gets `role = "admin"`
- New users default to `"viewer"`

---

## 2. `require_role()` Dependency

Added to `app/dependencies.py`:

```python
def require_role(*allowed_roles: UserRole):
    def dependency(current_user: User = Depends(get_current_user)):
        if current_user.role not in [r.value for r in allowed_roles]:
            raise HTTPException(403, f"Role '{current_user.role}' not authorized")
        return current_user
    return dependency
```

- Closure-based — returns a FastAPI `Depends`-compatible callable
- Returns the user object so endpoints don't need a second `get_current_user` call
- Compares against `.value` since the DB stores strings

**Acceptance criteria:**
- Reusable across any endpoint
- Returns 403 with clear message on role mismatch

---

## 3. Endpoint Role Gating

Apply `require_role()` to all mutating endpoints across routers:

| Router | Mutating endpoints | Required role |
|---|---|---|
| `sources.py` | POST, PUT, DELETE | ADMIN |
| `upload.py` | POST (upload) | ADMIN |
| `matching.py` | POST retrain, POST train-model | ADMIN |
| `review.py` | POST confirm/reject/skip, POST merge | ADMIN, REVIEWER |
| `unified.py` | POST promote singleton | ADMIN, REVIEWER |
| `users.py` | All mutating endpoints | ADMIN |
| All routers | GET (read-only) | Any authenticated user (no change) |

**Implementation:** Replace `current_user: User = Depends(get_current_user)` with `current_user: User = Depends(require_role(UserRole.ADMIN))` (or appropriate roles) on each mutating endpoint.

**Acceptance criteria:**
- Each endpoint gated by correct role per matrix
- Unauthorized access returns 403
- All existing tests updated with appropriate roles and passing

---

## 4. User Management Endpoints

All in `app/routers/users.py` unless noted. Existing:
- `GET /api/users` — list all (any authenticated user, unchanged)
- `POST /api/auth/users` — create user (lives in `auth.py`, not `users.py` — gate to ADMIN there, add `role` field to `UserCreate` schema)

New endpoints:

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/users/{user_id}` | Any authenticated | Get single user |
| `PUT /api/users/{user_id}` | ADMIN | Update username and/or role |
| `DELETE /api/users/{user_id}` | ADMIN | Hard delete user |
| `POST /api/users/{user_id}/toggle-active` | ADMIN | Flip `is_active` |
| `POST /api/users/{user_id}/change-password` | ADMIN or self | Reset/change password |

### Guards

- **Self-protection:** `DELETE` and `toggle-active` reject if `target.id == current_user.id`
- **Last admin:** `DELETE` and role demotion via `PUT` reject if target is the last admin (`SELECT count(*) FROM users WHERE role = 'admin' AND is_active = true`)
- **Password auth:** `change-password` returns 403 if requester is not admin and `user_id != current_user.id`

### Audit logging

All mutating actions call `audit.log_action()` with action type and details:
- `user_role_changed` — old role, new role
- `user_updated` — changed fields
- `user_deleted` — username of deleted user
- `user_toggled_active` — new active state
- `user_password_changed` — target user id (not the password)

**Acceptance criteria:**
- Full CRUD: create, read, update, delete, toggle-active, change-password
- All mutating actions admin-only (except self password change)
- All actions audit-logged
- Cannot delete/deactivate yourself
- Cannot remove last admin

---

## 5. Audit Log Verification

Verify `AuditLog.user_id` is nullable in both model and migration (exploration confirms it is). Add a test that creates a system audit entry with `user_id=None` to confirm no FK violation.

---

## 6. Testing Strategy

### New: `backend/tests/test_rbac.py`

- `require_role()` unit tests: admin passes admin-only, viewer gets 403, reviewer passes reviewer+admin check
- Endpoint integration tests per gated router: one "allowed" + one "denied" case per role boundary
- User CRUD happy paths: create, read, update, delete, toggle-active, change-password
- Edge cases: self-deletion blocked, last-admin demotion blocked, self-deactivation blocked, non-admin cross-user password change returns 403
- Audit assertions: role changes, creation, deletion, deactivation produce audit entries

### Existing test updates

Tests that hit now-gated endpoints need their fixture users to have `role="admin"` (or appropriate role). Since tests use SQLite with direct user creation, this means adding the role field to test user factories.

---

## Out of Scope

- Frontend changes (Sub-project 2)
- Pagination, search, notifications, signal labels, ML UI (Sub-project 2)
- Session invalidation on role change (not in spec, can be added later)
- Password complexity rules beyond min-length (not in spec)
