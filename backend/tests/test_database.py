"""Tests for database utilities."""

from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy.dialects import postgresql

from app.models.comparison import ComparisonRun
from app.models.unified import UnifiedRecord


class TestGetTaskSession:
    """get_task_session context manager guarantees session cleanup."""

    @patch("app.database.SessionLocal")
    def test_yields_session_and_closes(self, mock_session_local):
        """Session is yielded inside the block and closed on exit."""
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        from app.database import get_task_session

        with get_task_session() as db:
            assert db is mock_db
            mock_db.close.assert_not_called()

        mock_db.close.assert_called_once()


def test_postgres_create_all_uses_jsonb_for_json_payload_columns():
    dialect = postgresql.dialect()

    assert UnifiedRecord.__table__.c.source_record_ids.type.compile(dialect=dialect) == "JSONB"
    assert UnifiedRecord.__table__.c.fields.type.compile(dialect=dialect) == "JSONB"
    assert ComparisonRun.__table__.c.stats.type.compile(dialect=dialect) == "JSONB"

    @patch("app.database.SessionLocal")
    def test_closes_session_on_exception(self, mock_session_local):
        """Session is closed even when the block raises."""
        mock_db = MagicMock()
        mock_session_local.return_value = mock_db

        from app.database import get_task_session

        with pytest.raises(RuntimeError, match="boom"), get_task_session() as _:
            raise RuntimeError("boom")

        mock_db.close.assert_called_once()
