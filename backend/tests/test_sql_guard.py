"""Tests for the read-only SQL validator used by /api/ask."""

import pytest

from app.services.sql_guard import SqlGuardError, prepare_safe_select

ALLOWED = "v_unified_records_for_ask"


def test_passes_simple_select():
    out = prepare_safe_select("SELECT id FROM v_unified_records_for_ask", ALLOWED, limit_cap=200)
    assert "LIMIT 200" in out.upper()


def test_rejects_insert():
    with pytest.raises(SqlGuardError):
        prepare_safe_select("INSERT INTO v_unified_records_for_ask VALUES (1)", ALLOWED, limit_cap=200)


def test_rejects_update():
    with pytest.raises(SqlGuardError):
        prepare_safe_select("UPDATE v_unified_records_for_ask SET id=1", ALLOWED, limit_cap=200)


def test_rejects_delete():
    with pytest.raises(SqlGuardError):
        prepare_safe_select("DELETE FROM v_unified_records_for_ask", ALLOWED, limit_cap=200)


def test_rejects_merge():
    with pytest.raises(SqlGuardError):
        prepare_safe_select(
            "MERGE INTO v_unified_records_for_ask USING t ON 1=1 WHEN MATCHED THEN DELETE",
            ALLOWED,
            limit_cap=200,
        )


def test_rejects_multistatement():
    with pytest.raises(SqlGuardError):
        prepare_safe_select("SELECT 1; SELECT 2", ALLOWED, limit_cap=200)


def test_rejects_table_not_in_whitelist():
    with pytest.raises(SqlGuardError):
        prepare_safe_select("SELECT * FROM users", ALLOWED, limit_cap=200)


def test_rejects_join_to_other_table():
    with pytest.raises(SqlGuardError):
        prepare_safe_select(
            f"SELECT * FROM {ALLOWED} JOIN users ON 1=1",  # noqa: S608
            ALLOWED,
            limit_cap=200,
        )


def test_clamps_oversize_limit():
    out = prepare_safe_select(f"SELECT id FROM {ALLOWED} LIMIT 9999", ALLOWED, limit_cap=200)  # noqa: S608
    assert "LIMIT 200" in out.upper()
    assert "9999" not in out


def test_keeps_smaller_limit():
    out = prepare_safe_select(f"SELECT id FROM {ALLOWED} LIMIT 10", ALLOWED, limit_cap=200)  # noqa: S608
    assert "LIMIT 10" in out.upper()
