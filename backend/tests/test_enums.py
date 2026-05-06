"""Tests for status enum definitions."""

from app.models.enums import BatchStatus, CandidateStatus, RecordStatus


class TestBatchStatus:
    def test_values(self):
        assert BatchStatus.PENDING == "pending"
        assert BatchStatus.PROCESSING == "processing"
        assert BatchStatus.COMPLETED == "completed"
        assert BatchStatus.FAILED == "failed"

    def test_string_comparison(self):
        """StrEnum values compare equal to plain strings."""
        assert BatchStatus.PENDING == "pending"
        assert BatchStatus.PENDING != "other"


class TestRecordStatus:
    def test_values(self):
        assert RecordStatus.ACTIVE == "active"
        assert RecordStatus.SUPERSEDED == "superseded"


class TestCandidateStatus:
    def test_values(self):
        assert CandidateStatus.PENDING == "pending"
        assert CandidateStatus.CONFIRMED == "confirmed"
        assert CandidateStatus.REJECTED == "rejected"
        assert CandidateStatus.INVALIDATED == "invalidated"
