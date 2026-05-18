"""Tests for the built-in signal functions."""

from types import SimpleNamespace

import pytest

from app.services.scoring import compute_signal


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


def test_compute_signal_unknown_kind_raises():
    a = _rec(supplier_name="ACME")
    b = _rec(supplier_name="ACME")
    with pytest.raises(KeyError, match="no signal kind registered under"):
        compute_signal("never_registered_kind_xyz", a, b, field="supplier_name")


def test_exact_kind_case_sensitive():
    a = _rec(short_name="ACME-001")
    b = _rec(short_name="ACME-001")
    assert compute_signal("exact", a, b, field="short_name") == 1.0


def test_exact_kind_returns_zero_on_case_difference():
    a = _rec(short_name="ACME-001")
    b = _rec(short_name="acme-001")
    assert compute_signal("exact", a, b, field="short_name") == 0.0


def test_embedding_cosine_returns_one_for_identical_embeddings():
    import numpy as np

    vec = np.array([1.0, 0.0, 0.0], dtype=np.float32)
    a = _rec(supplier_name="anything", name_embedding=vec)
    b = _rec(supplier_name="something", name_embedding=vec)
    score = compute_signal("embedding_cosine", a, b, field="supplier_name")
    assert score == pytest.approx(1.0)


def test_embedding_cosine_drops_when_name_field_missing():
    import numpy as np

    vec = np.array([1.0, 0.0, 0.0], dtype=np.float32)
    a = _rec(name_embedding=vec)  # no supplier_name in fields
    b = _rec(name_embedding=vec)
    score = compute_signal("embedding_cosine", a, b, field="supplier_name")
    assert score is None


def test_embedding_cosine_returns_zero_for_orthogonal_embeddings():
    import numpy as np

    a = _rec(supplier_name="anything", name_embedding=np.array([1.0, 0.0, 0.0], dtype=np.float32))
    b = _rec(supplier_name="something", name_embedding=np.array([0.0, 1.0, 0.0], dtype=np.float32))
    score = compute_signal("embedding_cosine", a, b, field="supplier_name")
    assert score == pytest.approx(0.0)


def test_embedding_cosine_returns_neutral_when_embedding_missing():
    a = _rec(supplier_name="anything", name_embedding=None)
    b = _rec(supplier_name="something", name_embedding=None)
    score = compute_signal("embedding_cosine", a, b, field="supplier_name")
    assert score == 0.5  # neutral when missing — preserves today's behavior


def _rec_with_normalized(*, raw_name: str, normalized: str, **fields):
    """Like _rec but also sets record.normalized_name."""
    obj = SimpleNamespace(name=raw_name, fields={"supplier_name": raw_name, **fields}, name_embedding=None)
    obj.normalized_name = normalized
    return obj


def test_jaro_winkler_on_name_field_uses_normalized_name():
    """NAME-role JW scores on record.normalized_name, not the raw fields value.

    Without this, "HP-AUTOMATISME SARL" vs "HP AUTOMATISME" would jaccard poorly
    because the legal suffix and punctuation aren't stripped from the raw field.
    """
    a = _rec_with_normalized(raw_name="HP-AUTOMATISME SARL", normalized="HP AUTOMATISME")
    b = _rec_with_normalized(raw_name="HP AUTOMATISME", normalized="HP AUTOMATISME")
    score_with_flag = compute_signal("jaro_winkler", a, b, field="supplier_name", is_name_field=True)
    assert score_with_flag == pytest.approx(1.0)
    # Without the flag, the raw-field JW is < 1.0 (proves we changed the right thing)
    score_without = compute_signal("jaro_winkler", a, b, field="supplier_name")
    assert score_without < 1.0


def test_token_jaccard_on_name_field_uses_normalized_name():
    a = _rec_with_normalized(raw_name="HP-AUTOMATISME SARL", normalized="HP AUTOMATISME")
    b = _rec_with_normalized(raw_name="AUTOMATISME HP", normalized="HP AUTOMATISME")
    score = compute_signal("token_jaccard", a, b, field="supplier_name", is_name_field=True)
    assert score == pytest.approx(1.0)


def test_non_name_field_signals_unchanged_by_is_name_field_flag():
    """exact_ci on currency must NOT be affected by the new flag."""
    a = _rec(currency="usd")
    b = _rec(currency="USD")
    # is_name_field is silently ignored for non-name-aware kinds
    assert compute_signal("exact_ci", a, b, field="currency", is_name_field=False) == 1.0
    assert compute_signal("exact_ci", a, b, field="currency", is_name_field=True) == 1.0
