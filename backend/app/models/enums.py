"""Status enums for all entities — single source of truth for status values.

These are StrEnum subclasses so they serialize as plain strings and compare
equal to raw string literals. The DB columns remain String(20) — no migration
needed.
"""

from enum import StrEnum


class BatchStatus(StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class SupplierStatus(StrEnum):
    ACTIVE = "active"
    SUPERSEDED = "superseded"


class CandidateStatus(StrEnum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    REJECTED = "rejected"
    SKIPPED = "skipped"
    INVALIDATED = "invalidated"


class UserRole(StrEnum):
    ADMIN = "admin"
    REVIEWER = "reviewer"
    VIEWER = "viewer"
