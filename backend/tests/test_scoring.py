"""Tests for scoring service — multi-signal supplier pair scoring."""

import pytest
from unittest.mock import patch
import numpy as np

from app.models.staging import StagedSupplier
from app.services.scoring import score_pair


def _make_supplier_obj(**kwargs):
    """Create a StagedSupplier-like object for scoring tests (no DB needed)."""
    supplier = StagedSupplier.__new__(StagedSupplier)
    defaults = {
        "id": 1,
        "data_source_id": 1,
        "import_batch_id": 1,
        "name": None,
        "normalized_name": None,
        "short_name": None,
        "currency": None,
        "contact_name": None,
        "name_embedding": None,
        "status": "active",
    }
    defaults.update(kwargs)
    for k, v in defaults.items():
        object.__setattr__(supplier, k, v)
    return supplier


class TestScorePairSignals:
    """Test individual signal computations."""

    def test_identical_names_high_jaro_winkler(self):
        """Identical normalized names produce jaro_winkler ≈ 1.0."""
        a = _make_supplier_obj(id=1, normalized_name="ACME CORPORATION")
        b = _make_supplier_obj(id=2, normalized_name="ACME CORPORATION")
        result = score_pair(a, b)
        assert result["signals"]["jaro_winkler"] >= 0.99

    def test_identical_names_high_token_jaccard(self):
        """Identical normalized names produce token_jaccard ≈ 1.0."""
        a = _make_supplier_obj(id=1, normalized_name="ACME CORPORATION")
        b = _make_supplier_obj(id=2, normalized_name="ACME CORPORATION")
        result = score_pair(a, b)
        assert result["signals"]["token_jaccard"] >= 0.99

    def test_different_names_low_jaro_winkler(self):
        """Completely different names produce jaro_winkler < 0.5."""
        a = _make_supplier_obj(id=1, normalized_name="ACME CORPORATION")
        b = _make_supplier_obj(id=2, normalized_name="ZEPHYR HOLDINGS")
        result = score_pair(a, b)
        assert result["signals"]["jaro_winkler"] < 0.5

    def test_different_names_low_token_jaccard(self):
        """Completely different names produce token_jaccard < 0.3."""
        a = _make_supplier_obj(id=1, normalized_name="ACME CORPORATION")
        b = _make_supplier_obj(id=2, normalized_name="ZEPHYR HOLDINGS")
        result = score_pair(a, b)
        assert result["signals"]["token_jaccard"] < 0.3

    def test_same_currency_match(self):
        """Same currency returns 1.0."""
        a = _make_supplier_obj(id=1, normalized_name="A", currency="USD")
        b = _make_supplier_obj(id=2, normalized_name="B", currency="USD")
        result = score_pair(a, b)
        assert result["signals"]["currency_match"] == 1.0

    def test_different_currency_no_match(self):
        """Different currency returns 0.0."""
        a = _make_supplier_obj(id=1, normalized_name="A", currency="USD")
        b = _make_supplier_obj(id=2, normalized_name="B", currency="EUR")
        result = score_pair(a, b)
        assert result["signals"]["currency_match"] == 0.0

    def test_none_currency_neutral(self):
        """None currency returns 0.5 (neutral)."""
        a = _make_supplier_obj(id=1, normalized_name="A", currency="USD")
        b = _make_supplier_obj(id=2, normalized_name="B", currency=None)
        result = score_pair(a, b)
        assert result["signals"]["currency_match"] == 0.5

    def test_both_none_currency_neutral(self):
        """Both None currency returns 0.5 (neutral)."""
        a = _make_supplier_obj(id=1, normalized_name="A", currency=None)
        b = _make_supplier_obj(id=2, normalized_name="B", currency=None)
        result = score_pair(a, b)
        assert result["signals"]["currency_match"] == 0.5

    def test_same_short_name_match(self):
        """Same short_name returns 1.0."""
        a = _make_supplier_obj(id=1, normalized_name="A", short_name="ACM")
        b = _make_supplier_obj(id=2, normalized_name="B", short_name="ACM")
        result = score_pair(a, b)
        assert result["signals"]["short_name_match"] == 1.0

    def test_different_short_name_no_match(self):
        """Different short_name returns 0.0."""
        a = _make_supplier_obj(id=1, normalized_name="A", short_name="ACM")
        b = _make_supplier_obj(id=2, normalized_name="B", short_name="ZPH")
        result = score_pair(a, b)
        assert result["signals"]["short_name_match"] == 0.0

    def test_none_short_name_neutral(self):
        """None short_name returns 0.5 (neutral)."""
        a = _make_supplier_obj(id=1, normalized_name="A", short_name="ACM")
        b = _make_supplier_obj(id=2, normalized_name="B", short_name=None)
        result = score_pair(a, b)
        assert result["signals"]["short_name_match"] == 0.5

    def test_same_contact_match(self):
        """Same contact_name returns 1.0."""
        a = _make_supplier_obj(id=1, normalized_name="A", contact_name="John Smith")
        b = _make_supplier_obj(id=2, normalized_name="B", contact_name="John Smith")
        result = score_pair(a, b)
        assert result["signals"]["contact_match"] == 1.0

    def test_different_contact_jaro_winkler(self):
        """Different contact_name returns Jaro-Winkler similarity."""
        a = _make_supplier_obj(id=1, normalized_name="A", contact_name="John Smith")
        b = _make_supplier_obj(id=2, normalized_name="B", contact_name="Jane Doe")
        result = score_pair(a, b)
        assert 0.0 <= result["signals"]["contact_match"] <= 1.0
        assert (
            result["signals"]["contact_match"] < 0.8
        )  # Should be low for very different names

    def test_none_contact_neutral(self):
        """None contact returns 0.5 (neutral)."""
        a = _make_supplier_obj(id=1, normalized_name="A", contact_name="John Smith")
        b = _make_supplier_obj(id=2, normalized_name="B", contact_name=None)
        result = score_pair(a, b)
        assert result["signals"]["contact_match"] == 0.5

    def test_embedding_cosine_with_embeddings(self):
        """With embeddings, embedding_cosine computed via dot product."""
        # L2-normalized vectors — dot product = cosine similarity
        emb_a = np.array([1.0, 0.0, 0.0], dtype=np.float32)
        emb_b = np.array([1.0, 0.0, 0.0], dtype=np.float32)
        a = _make_supplier_obj(id=1, normalized_name="A", name_embedding=emb_a)
        b = _make_supplier_obj(id=2, normalized_name="B", name_embedding=emb_b)
        result = score_pair(a, b)
        assert result["signals"]["embedding_cosine"] >= 0.99

    def test_embedding_cosine_orthogonal(self):
        """Orthogonal embeddings produce embedding_cosine ≈ 0.0."""
        emb_a = np.array([1.0, 0.0, 0.0], dtype=np.float32)
        emb_b = np.array([0.0, 1.0, 0.0], dtype=np.float32)
        a = _make_supplier_obj(id=1, normalized_name="A", name_embedding=emb_a)
        b = _make_supplier_obj(id=2, normalized_name="B", name_embedding=emb_b)
        result = score_pair(a, b)
        assert abs(result["signals"]["embedding_cosine"]) < 0.01

    def test_embedding_cosine_none_neutral(self):
        """No embeddings returns 0.5 (neutral)."""
        a = _make_supplier_obj(id=1, normalized_name="A", name_embedding=None)
        b = _make_supplier_obj(id=2, normalized_name="B", name_embedding=None)
        result = score_pair(a, b)
        assert result["signals"]["embedding_cosine"] == 0.5


class TestScorePairAggregation:
    """Test weighted confidence computation."""

    def test_returns_confidence_and_signals(self):
        """score_pair returns dict with 'confidence' and 'signals' keys."""
        a = _make_supplier_obj(id=1, normalized_name="ACME CORP")
        b = _make_supplier_obj(id=2, normalized_name="ACME INDUSTRIES")
        result = score_pair(a, b)
        assert "confidence" in result
        assert "signals" in result
        assert isinstance(result["confidence"], float)
        assert isinstance(result["signals"], dict)

    def test_all_six_signals_present(self):
        """All 6 signal keys present in signals dict."""
        a = _make_supplier_obj(id=1, normalized_name="ACME CORP")
        b = _make_supplier_obj(id=2, normalized_name="ACME INDUSTRIES")
        result = score_pair(a, b)
        expected_keys = {
            "jaro_winkler",
            "token_jaccard",
            "embedding_cosine",
            "short_name_match",
            "currency_match",
            "contact_match",
        }
        assert set(result["signals"].keys()) == expected_keys

    def test_all_signals_0_to_1(self):
        """All signal values are between 0.0 and 1.0 inclusive."""
        a = _make_supplier_obj(
            id=1,
            normalized_name="ACME CORP",
            currency="USD",
            short_name="ACM",
            contact_name="John",
        )
        b = _make_supplier_obj(
            id=2,
            normalized_name="BETA INC",
            currency="EUR",
            short_name="BET",
            contact_name="Jane",
        )
        result = score_pair(a, b)
        for signal_name, value in result["signals"].items():
            assert 0.0 <= value <= 1.0, f"Signal {signal_name} out of range: {value}"

    def test_confidence_is_weighted_sum(self):
        """confidence equals weighted sum of signals using settings weights."""
        a = _make_supplier_obj(id=1, normalized_name="TEST COMPANY")
        b = _make_supplier_obj(id=2, normalized_name="TEST COMPANY")
        result = score_pair(a, b)

        from app.config import settings

        expected = (
            result["signals"]["jaro_winkler"] * settings.matching_weight_jaro_winkler
            + result["signals"]["token_jaccard"]
            * settings.matching_weight_token_jaccard
            + result["signals"]["embedding_cosine"]
            * settings.matching_weight_embedding_cosine
            + result["signals"]["short_name_match"]
            * settings.matching_weight_short_name
            + result["signals"]["currency_match"] * settings.matching_weight_currency
            + result["signals"]["contact_match"] * settings.matching_weight_contact
        )
        assert abs(result["confidence"] - expected) < 0.001

    def test_confidence_0_to_1(self):
        """Confidence is between 0.0 and 1.0."""
        a = _make_supplier_obj(id=1, normalized_name="ACME CORP")
        b = _make_supplier_obj(id=2, normalized_name="BETA INC")
        result = score_pair(a, b)
        assert 0.0 <= result["confidence"] <= 1.0

    def test_currency_case_insensitive(self):
        """Currency comparison is case-insensitive."""
        a = _make_supplier_obj(id=1, normalized_name="A", currency="usd")
        b = _make_supplier_obj(id=2, normalized_name="B", currency="USD")
        result = score_pair(a, b)
        assert result["signals"]["currency_match"] == 1.0
