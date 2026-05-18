"""Tests for the RecordType abstraction and registry."""

import pytest

from app.record_types.base import FieldDef, RecordType, Role, Signal


@pytest.fixture(autouse=True)
def _isolate_record_type_registry():
    """Snapshot the registry, run the test, then restore — so tests that call
    `_testing_clear_registry()` don't pollute later tests (notably the Supplier
    tests in test_supplier_type.py, which depend on the import-time registration).
    """
    from app.record_types import _REGISTRY, _testing_clear_registry, register

    snapshot = dict(_REGISTRY)
    yield
    _testing_clear_registry()
    for rt in snapshot.values():
        register(rt)


def test_recordtype_requires_exactly_one_name_field():
    with pytest.raises(ValueError, match="exactly one"):
        RecordType(
            key="bad",
            label="Bad",
            fields=[FieldDef("foo", label="Foo", role=Role.EXTRA)],
            signals=[],
        )


def test_recordtype_rejects_two_name_fields():
    with pytest.raises(ValueError, match="exactly one"):
        RecordType(
            key="bad",
            label="Bad",
            fields=[
                FieldDef("a", label="A", role=Role.NAME, required=True),
                FieldDef("b", label="B", role=Role.NAME, required=True),
            ],
            signals=[],
        )


def test_recordtype_field_keys_must_be_unique():
    with pytest.raises(ValueError, match="duplicate field key"):
        RecordType(
            key="bad",
            label="Bad",
            fields=[
                FieldDef("a", label="A", role=Role.NAME, required=True),
                FieldDef("a", label="A2", role=Role.EXTRA),
            ],
            signals=[],
        )


def test_recordtype_signal_field_must_reference_known_field():
    with pytest.raises(ValueError, match="unknown field 'ghost'"):
        RecordType(
            key="bad",
            label="Bad",
            fields=[FieldDef("a", label="A", role=Role.NAME, required=True)],
            signals=[Signal(kind="jaro_winkler", field="ghost", weight=1.0)],
        )


def test_recordtype_name_field_property():
    rt = RecordType(
        key="x",
        label="X",
        fields=[
            FieldDef("primary", label="Primary", role=Role.NAME, required=True),
            FieldDef("other", label="Other", role=Role.EXTRA),
        ],
        signals=[],
    )
    assert rt.name_field.key == "primary"


def test_recordtype_is_frozen_after_construction():
    rt = RecordType(
        key="x",
        label="X",
        fields=[FieldDef("primary", label="Primary", role=Role.NAME, required=True)],
        signals=[],
    )
    with pytest.raises((AttributeError, TypeError)):
        rt.key = "y"  # immutable


def test_registry_register_and_lookup():
    from app.record_types import _testing_clear_registry, get, register

    _testing_clear_registry()
    rt = RecordType(
        key="testtype",
        label="TestType",
        fields=[FieldDef("primary", label="Primary", role=Role.NAME, required=True)],
        signals=[],
    )
    register(rt)
    assert get("testtype") is rt
    with pytest.raises(KeyError):
        get("missing")


def test_registry_rejects_duplicate_keys():
    from app.record_types import _testing_clear_registry, register

    _testing_clear_registry()
    rt = RecordType(
        key="dup",
        label="Dup",
        fields=[FieldDef("primary", label="Primary", role=Role.NAME, required=True)],
        signals=[],
    )
    register(rt)
    with pytest.raises(ValueError, match="already registered"):
        register(rt)


def test_embedding_cosine_signal_must_reference_name_field():
    with pytest.raises(ValueError, match="embedding_cosine signal must reference"):
        RecordType(
            key="bad",
            label="Bad",
            fields=[
                FieldDef("a", label="A", role=Role.NAME, required=True),
                FieldDef("b", label="B", role=Role.EXTRA),
            ],
            signals=[Signal(kind="embedding_cosine", field="b", weight=1.0)],
        )


def test_recordtype_rejects_non_positive_signal_weight():
    with pytest.raises(ValueError, match="non-positive weight"):
        RecordType(
            key="bad",
            label="Bad",
            fields=[FieldDef("a", label="A", role=Role.NAME, required=True)],
            signals=[Signal(kind="jaro_winkler", field="a", weight=0.0)],
        )


def test_supplier_has_business_code_field():
    from app.record_types import get

    rt = get("supplier")
    keys = {f.key for f in rt.fields}
    assert "business_code" in keys
    bc = next(f for f in rt.fields if f.key == "business_code")
    from app.record_types.base import Role

    assert bc.role == Role.CODE
    assert bc.required is False
    assert bc.normalize == "identifier"
    assert "BPSNUM_0" in bc.synonyms


def test_supplier_business_code_not_in_global_signals():
    """business_code is a within-source tiebreaker only — never a global matching signal."""
    from app.record_types import get

    rt = get("supplier")
    signal_fields = {s.field for s in rt.signals}
    assert "business_code" not in signal_fields


def test_all_types_returns_insertion_order():
    from app.record_types import _testing_clear_registry, all_types, register

    _testing_clear_registry()
    a = RecordType(
        key="a",
        label="A",
        fields=[FieldDef("primary", label="Primary", role=Role.NAME, required=True)],
        signals=[],
    )
    b = RecordType(
        key="b",
        label="B",
        fields=[FieldDef("primary", label="Primary", role=Role.NAME, required=True)],
        signals=[],
    )
    c = RecordType(
        key="c",
        label="C",
        fields=[FieldDef("primary", label="Primary", role=Role.NAME, required=True)],
        signals=[],
    )
    register(a)
    register(b)
    register(c)
    assert tuple(rt.key for rt in all_types()) == ("a", "b", "c")
