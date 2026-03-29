"""Tests for role-based access control."""

import pytest
from fastapi import HTTPException

from app.models.enums import UserRole
from app.models.user import User
from app.services.auth import create_token, hash_password


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
            json={
                "name": "Test",
                "column_mapping": {"supplier_name": "Name", "supplier_code": "Code"},
            },
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
        self._setup_admin(test_db)
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
        self._setup_admin(test_db)
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
        self._setup_admin(test_db)
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
