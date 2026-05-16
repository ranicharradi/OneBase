"""Tests for per-type scoring strategy in score_pair."""

from types import SimpleNamespace

import pytest

from app.record_types import _testing_clear_registry, register
from app.record_types.base import FieldDef, RecordType, Role, Signal
from app.record_types.supplier import SUPPLIER
from app.services.scoring import score_pair


@pytest.fixture(autouse=True)
def _restore_registry():
    """Each test that swaps the registry must restore it after."""
    yield
    _testing_clear_registry()
    register(SUPPLIER)
    # Re-register types that other tests rely on. We import the type objects
    # directly because module-level `register()` calls in bank.py / client.py
    # only fire once per process — re-importing the modules here is a no-op.
    from app.record_types.bank import BANK
    from app.record_types.client import CLIENT

    register(BANK)
    register(CLIENT)


def _make_record(type_key, name, fields, embedding=None):
    return SimpleNamespace(
        id=1,
        type=type_key,
        data_source_id=1,
        import_batch_id=1,
        name=name,
        normalized_name=name,
        name_embedding=embedding,
        status="active",
        fields=fields,
    )


def _register_test_type(scoring):
    _testing_clear_registry()
    rt = RecordType(
        key="t_score",
        label="T",
        fields=(
            FieldDef(key="n", label="N", role=Role.NAME, required=True),
            FieldDef(key="extra", label="Extra", role=Role.EXTRA),
        ),
        signals=(
            Signal(kind="jaro_winkler", field="n", weight=0.60),
            Signal(kind="exact_ci", field="extra", weight=0.40),
        ),
        scoring=scoring,
    )
    register(rt)
    return rt


def test_total_weight_denominator_when_strategy_is_total_weight():
    """Default behavior: divides by sum of ALL declared weights."""
    _register_test_type(scoring="total_weight")
    # name fires (perfect), extra missing on one side → only name contributes
    a = _make_record("t_score", "ACME", {"n": "ACME"})
    b = _make_record("t_score", "ACME", {"n": "ACME"})
    result = score_pair(a, b)
    # weighted_sum = 1.0 * 0.60 = 0.60; total_weight = 1.00
    assert result is not None
    assert result["confidence"] == pytest.approx(0.60, abs=0.01)


def test_contributing_weight_denominator():
    """contributing_weight: divides by sum of weights of signals that actually fired."""
    _register_test_type(scoring="contributing_weight")
    a = _make_record("t_score", "ACME", {"n": "ACME"})
    b = _make_record("t_score", "ACME", {"n": "ACME"})
    result = score_pair(a, b)
    # Only name fired: weighted_sum = 0.60; contributing = 0.60 → conf 1.0
    assert result is not None
    assert result["confidence"] == pytest.approx(1.0, abs=0.01)


def test_contributing_weight_returns_none_when_name_signal_does_not_fire():
    """NAME guard: if no NAME-derived signal fires on either side, return None."""
    _register_test_type(scoring="contributing_weight")
    # name field missing on both sides, only extra populated and matching
    a = _make_record("t_score", None, {"extra": "X"})
    b = _make_record("t_score", None, {"extra": "X"})
    result = score_pair(a, b)
    assert result is None


def test_contributing_weight_returns_none_when_name_missing_on_one_side():
    """NAME guard fires even when one side has the name field."""
    _register_test_type(scoring="contributing_weight")
    a = _make_record("t_score", "ACME", {"n": "ACME", "extra": "X"})
    b = _make_record("t_score", None, {"extra": "X"})
    # Name signal can't be computed (b lacks 'n') so it doesn't fire → no candidate
    result = score_pair(a, b)
    assert result is None


def test_total_weight_does_not_apply_name_guard():
    """Under total_weight, missing-name still scores (low value); no None return."""
    _register_test_type(scoring="total_weight")
    a = _make_record("t_score", None, {"extra": "X"})
    b = _make_record("t_score", None, {"extra": "X"})
    result = score_pair(a, b)
    # Only extra fires: weighted_sum = 1.0 * 0.40 = 0.40; total_weight = 1.00
    assert result is not None
    assert result["confidence"] == pytest.approx(0.40, abs=0.01)


def test_signals_dict_contains_only_fired_signals_under_contributing_weight():
    _register_test_type(scoring="contributing_weight")
    a = _make_record("t_score", "ACME", {"n": "ACME"})
    b = _make_record("t_score", "ACME", {"n": "ACME"})
    result = score_pair(a, b)
    assert result is not None
    assert "jaro_winkler:n" in result["signals"]
    assert "exact_ci:extra" not in result["signals"]


def test_signals_dict_contains_only_fired_signals_under_total_weight():
    _register_test_type(scoring="total_weight")
    a = _make_record("t_score", "ACME", {"n": "ACME"})
    b = _make_record("t_score", "ACME", {"n": "ACME"})
    result = score_pair(a, b)
    assert result is not None
    assert "jaro_winkler:n" in result["signals"]
    assert "exact_ci:extra" not in result["signals"]
