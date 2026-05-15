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


def test_dashboard_activity_mapper_curates_actor_and_noise():
    from app.models.audit import AuditLog
    from app.models.user import User
    from app.routers.dashboard import curate_dashboard_activity

    user = User(id=1, username="testuser")
    rows = [
        AuditLog(
            id=1,
            user_id=user.id,
            action="upload",
            entity_type="import_batch",
            entity_id=10,
            details={"filename": "noisy_supplier_upload.csv", "type": "supplier"},
        ),
        AuditLog(
            id=2,
            action="match_rejected",
            entity_type="match_candidate",
            entity_id=20,
            details={"type": "supplier", "reviewed_by": "reviewer", "name": "Noisy Candidate Name"},
        ),
        AuditLog(
            id=3,
            action="singleton_promoted",
            entity_type="unified_record",
            entity_id=30,
            details={"type": "supplier", "name": "Noisy Singleton Name", "chosen_by": "reviewer"},
        ),
        AuditLog(id=4, user_id=user.id, action="login", entity_type="user", entity_id=user.id),
    ]

    activity = curate_dashboard_activity(rows, {user.id: user.username})

    assert [item.action for item in activity] == ["upload"]
    assert activity[0].actor == "testuser"
    assert activity[0].title == "Uploaded supplier batch"
    assert activity[0].tone == "info"


def test_dashboard_activity_mapper_summarizes_review_and_merge_threshold():
    from app.models.audit import AuditLog
    from app.routers.dashboard import curate_dashboard_activity

    rows = [
        AuditLog(
            id=i,
            action="match_rejected",
            entity_type="match_candidate",
            entity_id=i,
            details={"type": "supplier", "reviewed_by": "reviewer", "name": f"Noisy Candidate {i}"},
        )
        for i in range(1, 4)
    ]
    rows += [
        AuditLog(
            id=i,
            action="merge_confirmed",
            entity_type="match_candidate",
            entity_id=i,
            details={"type": "supplier", "reviewed_by": "reviewer"},
        )
        for i in range(4, 7)
    ]

    activity = curate_dashboard_activity(rows, {})

    assert [item.action for item in activity] == ["match_rejected", "merge_confirmed"]
    assert activity[0].actor == "reviewer"
    assert activity[0].title == "Rejected 3 match candidates"
    assert activity[0].tone == "warn"
    assert activity[0].details == {"type": "supplier", "count": 3}
    assert activity[1].title == "Merged 3 record groups"
    assert activity[1].tone == "ok"


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
        json={"username": "audited_user", "password": "AuditPass1"},
    )

    entry = test_db.query(AuditLog).filter_by(action="create_user").first()
    assert entry is not None
    assert entry.entity_type == "user"
