"""Tests for audit trail logging."""


def test_log_action_creates_entry(test_db):
    """log_action creates audit_log entry with correct fields."""
    from app.models.audit import AuditLog
    from app.models.user import User
    from app.services.audit import log_action
    from app.services.auth import hash_password

    user = User(
        username="audittest",
        password_hash=hash_password("pass123"),
        is_active=True,
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)

    log_action(
        db=test_db,
        user_id=user.id,
        action="test_action",
        entity_type="test_entity",
        entity_id=42,
        details={"key": "value"},
    )
    test_db.commit()

    entry = test_db.query(AuditLog).filter_by(action="test_action").first()
    assert entry is not None
    assert entry.user_id == user.id
    assert entry.action == "test_action"
    assert entry.entity_type == "test_entity"
    assert entry.entity_id == 42
    assert entry.details == {"key": "value"}


def test_login_creates_audit_entry(test_client, test_db):
    """Login action is logged in audit_log."""
    from app.models.audit import AuditLog
    from app.models.user import User
    from app.services.auth import hash_password

    user = User(
        username="auditlogin",
        password_hash=hash_password("secret123"),
        is_active=True,
    )
    test_db.add(user)
    test_db.commit()

    test_client.post(
        "/api/auth/login",
        data={"username": "auditlogin", "password": "secret123"},
    )

    entry = test_db.query(AuditLog).filter_by(action="login").first()
    assert entry is not None
    assert entry.user_id == user.id


def test_user_creation_creates_audit_entry(authenticated_client, test_db):
    """User creation action is logged in audit_log."""
    from app.models.audit import AuditLog

    authenticated_client.post(
        "/api/auth/users",
        json={"username": "audited_user", "password": "pass123456"},
    )

    entry = test_db.query(AuditLog).filter_by(action="create_user").first()
    assert entry is not None
    assert entry.entity_type == "user"
