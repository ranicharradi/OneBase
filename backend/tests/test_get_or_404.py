import pytest
from fastapi import HTTPException

from app.dependencies import get_or_404
from app.models.user import User


def test_returns_model_when_found(test_db):
    user = User(username="alice", password_hash="not_a_real_hash", role="admin")  # noqa: S106
    test_db.add(user)
    test_db.flush()
    assert get_or_404(test_db, User, user.id).id == user.id


def test_raises_404_when_missing(test_db):
    with pytest.raises(HTTPException) as exc:
        get_or_404(test_db, User, 99999)
    assert exc.value.status_code == 404
    assert "User" in exc.value.detail


def test_custom_label(test_db):
    with pytest.raises(HTTPException) as exc:
        get_or_404(test_db, User, 99999, label="Account")
    assert "Account" in exc.value.detail
