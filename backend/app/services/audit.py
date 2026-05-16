"""Audit trail logging service."""

from typing import Any

from sqlalchemy.orm import Session

from app.models.audit import AuditLog


def log_action(
    db: Session,
    user_id: int | None,
    action: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
    details: dict[str, Any] | None = None,
) -> AuditLog:
    """Create an audit log entry."""
    entry = AuditLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details,
    )
    db.add(entry)
    db.flush()
    return entry


def audit_action_to_kind(action: str) -> str:
    """Map an AuditLog.action string to a stable 'kind' for dashboard/lineage views."""
    if action.startswith("merge"):
        return "merged"
    if action.startswith("match_rejected"):
        return "reviewed"
    return "reviewed"
