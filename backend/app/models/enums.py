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


class FileCheckStatus(StrEnum):
    PROCESSING = "processing"
    CLEAN = "clean"
    WARNING = "warning"
    FAILED = "failed"
    ERROR = "error"


class FileCheckIssueType(StrEnum):
    EMPTY_ROW = "empty_row"
    MISSING_VALUE = "missing_value"
    CORRUPTED_VALUE = "corrupted_value"
    PARSE_ERROR = "parse_error"


class FileCheckSeverity(StrEnum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


class SupplierStatus(StrEnum):
    ACTIVE = "active"
    SUPERSEDED = "superseded"


class CandidateStatus(StrEnum):
    PENDING = "pending"
    CONFIRMED = "confirmed"  # confirmed as dupe, awaiting field reconciliation
    MERGED = "merged"  # reconciled and merged into a UnifiedSupplier
    REJECTED = "rejected"
    INVALIDATED = "invalidated"


class UserRole(StrEnum):
    ADMIN = "admin"
    REVIEWER = "reviewer"
    VIEWER = "viewer"
