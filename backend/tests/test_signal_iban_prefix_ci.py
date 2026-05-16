"""Tests for the iban_prefix_ci signal."""

from types import SimpleNamespace

from app.services.scoring import SIGNAL_FNS, compute_signal


def _record(iban):
    return SimpleNamespace(fields={"iban": iban} if iban is not None else {})


def test_iban_prefix_ci_registered():
    assert "iban_prefix_ci" in SIGNAL_FNS


def test_iban_prefix_ci_matching_prefix_returns_one():
    """Two TN IBANs from the same bank+branch (chars [4:12] equal) return 1.0."""
    a = _record("TN9701001020110500861125")
    b = _record("TN5901001020220900345678")  # same "01001020" slot
    result = compute_signal("iban_prefix_ci", a, b, "iban")
    assert result == 1.0


def test_iban_prefix_ci_different_prefix_returns_zero():
    """Different bank+branch slot returns 0.0."""
    a = _record("TN9701001020110500861125")  # "01001020"
    b = _record("TN5904154235404700147663")  # "04154235"
    result = compute_signal("iban_prefix_ci", a, b, "iban")
    assert result == 0.0


def test_iban_prefix_ci_one_side_missing_returns_none():
    a = _record("TN9701001020110500861125")
    b = _record(None)
    result = compute_signal("iban_prefix_ci", a, b, "iban")
    assert result is None


def test_iban_prefix_ci_both_sides_missing_returns_none():
    a = _record(None)
    b = _record(None)
    result = compute_signal("iban_prefix_ci", a, b, "iban")
    assert result is None


def test_iban_prefix_ci_too_short_returns_none():
    """Truncated IBAN (< 12 chars) can't yield a full prefix — treat as missing."""
    a = _record("TN970100")  # only 8 chars
    b = _record("TN9701001020110500861125")
    result = compute_signal("iban_prefix_ci", a, b, "iban")
    assert result is None


def test_iban_prefix_ci_is_case_and_whitespace_insensitive():
    """Slicing happens on stripped/uppercased value — handles non-canonicalized input."""
    a = _record("tn97 0100 1020 1105 0086 1125")
    b = _record("TN9701001020110500861125")
    result = compute_signal("iban_prefix_ci", a, b, "iban")
    assert result == 1.0
