"""Tests for the dynamic Ask-view rebuilder."""

from app.services.ask_view import _collect_field_keys


def test_collect_field_keys_includes_all_registered_types(test_db):
    """All FieldDef.keys from registered types appear in the union, deduped."""
    keys = _collect_field_keys()
    # supplier type is registered at import time
    assert "supplier_name" in keys
    assert "short_name" in keys
    assert "currency" in keys
    assert "contact_name" in keys
    # No duplicates
    assert len(keys) == len(set(keys))


def test_collect_field_keys_dedups_across_types(test_db):
    """When two types share a field key, the column appears once."""
    from app.record_types import _testing_clear_registry, all_types, register
    from app.record_types.base import FieldDef, RecordType, Role
    from app.record_types.supplier import SUPPLIER

    original = list(all_types())
    _testing_clear_registry()
    try:
        register(SUPPLIER)
        register(
            RecordType(
                key="material",
                label="Material",
                fields=(
                    FieldDef("material_name", label="Material Name", role=Role.NAME, required=True),
                    # Reuse currency — must collapse to one column
                    FieldDef("currency", label="Currency", role=Role.ENUM),
                ),
            )
        )
        keys = _collect_field_keys()
    finally:
        _testing_clear_registry()
        for rt in original:
            register(rt)

    assert keys.count("currency") == 1
    assert "supplier_name" in keys
    assert "material_name" in keys


def test_refresh_ask_view_noop_on_sqlite(test_db):
    """refresh_ask_view is a no-op on SQLite (Postgres-only feature)."""
    from app.services.ask_view import refresh_ask_view

    # Should not raise on the SQLite test session
    refresh_ask_view(test_db)
