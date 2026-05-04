"""Tests for the signal-kind registry and built-in signal functions."""

from types import SimpleNamespace

import pytest

from app.services.signals import compute_signal, get_kind, list_kinds, register_kind


def _rec(**kwargs):
    """Build a record-shaped object with `name`, `fields`, and `name_embedding` attributes.

    Convention: the NAME field's value is duplicated into both `record.name`
    (for queries / display / embedding) and `record.fields[<name_key>]` (so
    signal kinds resolve uniformly via the JSONB lookup). Tests pass the NAME
    field as a normal kwarg — it lands in `fields` and is mirrored to `name`
    if a kwarg called `name` is also provided, otherwise leave it None.
    """
    name_embedding = kwargs.pop("name_embedding", None)
    name = kwargs.pop("name", None)
    return SimpleNamespace(name=name, fields=kwargs, name_embedding=name_embedding)


@pytest.fixture(autouse=True)
def _isolate_signal_registry():
    from app.services.signals.registry import _testing_clear_registry

    _testing_clear_registry()
    # Re-register built-ins by re-importing the module (importlib.reload)
    import importlib

    from app.services.signals import builtins

    importlib.reload(builtins)
    yield
    _testing_clear_registry()


def test_jaro_winkler_kind_returns_one_for_identical_strings():
    a = _rec(supplier_name="ACME CORP")
    b = _rec(supplier_name="ACME CORP")
    assert compute_signal("jaro_winkler", a, b, field="supplier_name") == pytest.approx(1.0)


def test_jaro_winkler_kind_below_one_for_different_strings():
    a = _rec(supplier_name="ACME CORP")
    b = _rec(supplier_name="GLOBEX INC")
    score = compute_signal("jaro_winkler", a, b, field="supplier_name")
    assert 0.0 <= score < 1.0


def test_token_jaccard_kind_full_overlap_is_one():
    a = _rec(supplier_name="acme corp ltd")
    b = _rec(supplier_name="ltd corp acme")
    assert compute_signal("token_jaccard", a, b, field="supplier_name") == pytest.approx(1.0)


def test_exact_ci_kind_case_insensitive():
    a = _rec(currency="usd")
    b = _rec(currency="USD")
    assert compute_signal("exact_ci", a, b, field="currency") == 1.0


def test_exact_ci_kind_returns_zero_for_mismatch():
    a = _rec(currency="USD")
    b = _rec(currency="EUR")
    assert compute_signal("exact_ci", a, b, field="currency") == 0.0


def test_compute_signal_returns_none_when_either_side_missing():
    a = _rec(currency=None)
    b = _rec(currency="USD")
    assert compute_signal("exact_ci", a, b, field="currency") is None


def test_register_kind_and_lookup():
    register_kind("test_one", lambda a, b, field: 0.42)
    assert get_kind("test_one")(None, None, None) == 0.42
    assert "test_one" in list_kinds()


def test_register_kind_rejects_duplicates():
    register_kind("dup_check", lambda a, b, field: 0.0)
    with pytest.raises(ValueError, match="already registered"):
        register_kind("dup_check", lambda a, b, field: 1.0)


def test_get_kind_unknown_raises():
    with pytest.raises(KeyError):
        get_kind("never_registered_kind_xyz")
