"""Tests for scoring service — multi-signal record pair scoring."""

from types import SimpleNamespace

import numpy as np

from app.services.scoring import score_pair, signal_key

# The supplier type uses these signal keys (kind:field format)
JW_NAME = signal_key("jaro_winkler", "supplier_name")
TJ_NAME = signal_key("token_jaccard", "supplier_name")
EMB_NAME = signal_key("embedding_cosine", "supplier_name")
JW_SHORT = signal_key("jaro_winkler", "short_name")
EXACT_CURRENCY = signal_key("exact_ci", "currency")
JW_CONTACT = signal_key("jaro_winkler", "contact_name")


def _make_record_obj(**kwargs):
    """Create a record-like object for scoring tests (no DB needed).

    Uses SimpleNamespace to avoid SQLAlchemy instrumentation issues.
    Fields that were typed columns on the old staging model are now in `fields` JSONB.
    """
    defaults = {
        "id": 1,
        "type": "supplier",
        "data_source_id": 1,
        "import_batch_id": 1,
        "name": None,
        "normalized_name": None,
        "name_embedding": None,
        "status": "active",
        "fields": {},
    }
    # Accept legacy kwarg names and translate into fields JSONB
    field_map = {
        "short_name": "short_name",
        "currency": "currency",
        "contact_name": "contact_name",
        "source_code": "short_name",
        "payment_terms": "currency",
        "supplier_type": "contact_name",
    }
    fields = dict(kwargs.pop("fields", {}))
    for kwarg_key, field_key in field_map.items():
        if kwarg_key in kwargs:
            val = kwargs.pop(kwarg_key)
            if val is not None:
                fields[field_key] = val

    defaults.update(kwargs)
    defaults["fields"] = fields
    return SimpleNamespace(**defaults)


class TestScorePairSignals:
    """Test individual signal computations."""

    def test_identical_names_high_jaro_winkler(self):
        """Identical normalized names produce jaro_winkler:supplier_name ≈ 1.0."""
        a = _make_record_obj(id=1, normalized_name="ACME CORPORATION", fields={"supplier_name": "ACME CORPORATION"})
        b = _make_record_obj(id=2, normalized_name="ACME CORPORATION", fields={"supplier_name": "ACME CORPORATION"})
        result = score_pair(a, b)
        assert result["signals"][JW_NAME] >= 0.99

    def test_identical_names_high_token_jaccard(self):
        """Identical normalized names produce token_jaccard:supplier_name ≈ 1.0."""
        a = _make_record_obj(id=1, normalized_name="ACME CORPORATION", fields={"supplier_name": "ACME CORPORATION"})
        b = _make_record_obj(id=2, normalized_name="ACME CORPORATION", fields={"supplier_name": "ACME CORPORATION"})
        result = score_pair(a, b)
        assert result["signals"][TJ_NAME] >= 0.99

    def test_different_names_low_jaro_winkler(self):
        """Very different names produce low jaro_winkler (< 0.6)."""
        a = _make_record_obj(id=1, normalized_name="ACME CORPORATION", fields={"supplier_name": "ACME CORPORATION"})
        b = _make_record_obj(id=2, normalized_name="ZEPHYR HOLDINGS", fields={"supplier_name": "ZEPHYR HOLDINGS"})
        result = score_pair(a, b)
        assert result["signals"][JW_NAME] < 0.6

    def test_different_names_low_token_jaccard(self):
        """Completely different names produce token_jaccard < 0.3."""
        a = _make_record_obj(id=1, normalized_name="ACME CORPORATION", fields={"supplier_name": "ACME CORPORATION"})
        b = _make_record_obj(id=2, normalized_name="ZEPHYR HOLDINGS", fields={"supplier_name": "ZEPHYR HOLDINGS"})
        result = score_pair(a, b)
        assert result["signals"][TJ_NAME] < 0.3

    def test_same_currency_match(self):
        """Same currency returns 1.0."""
        a = _make_record_obj(
            id=1, normalized_name="A", currency="USD", fields={"supplier_name": "A", "currency": "USD"}
        )
        b = _make_record_obj(
            id=2, normalized_name="B", currency="USD", fields={"supplier_name": "B", "currency": "USD"}
        )
        result = score_pair(a, b)
        assert result["signals"][EXACT_CURRENCY] == 1.0

    def test_different_currency_no_match(self):
        """Different currency returns 0.0."""
        a = _make_record_obj(id=1, normalized_name="A", fields={"supplier_name": "A", "currency": "USD"})
        b = _make_record_obj(id=2, normalized_name="B", fields={"supplier_name": "B", "currency": "EUR"})
        result = score_pair(a, b)
        assert result["signals"][EXACT_CURRENCY] == 0.0

    def test_none_currency_dropped(self):
        """exact_ci:currency is omitted when one side is None."""
        a = _make_record_obj(id=1, normalized_name="A", fields={"supplier_name": "A", "currency": "USD"})
        b = _make_record_obj(id=2, normalized_name="B", fields={"supplier_name": "B"})
        result = score_pair(a, b)
        assert EXACT_CURRENCY not in result["signals"]

    def test_both_none_currency_dropped(self):
        """exact_ci:currency is omitted when both sides are None."""
        a = _make_record_obj(id=1, normalized_name="A", fields={"supplier_name": "A"})
        b = _make_record_obj(id=2, normalized_name="B", fields={"supplier_name": "B"})
        result = score_pair(a, b)
        assert EXACT_CURRENCY not in result["signals"]

    def test_same_short_name_match(self):
        """Identical short_name produces jaro_winkler:short_name ≈ 1.0."""
        a = _make_record_obj(id=1, normalized_name="A", fields={"supplier_name": "A", "short_name": "ACM"})
        b = _make_record_obj(id=2, normalized_name="B", fields={"supplier_name": "B", "short_name": "ACM"})
        result = score_pair(a, b)
        assert result["signals"][JW_SHORT] >= 0.99

    def test_short_name_prefix_match(self):
        """Prefix short_name (e.g., IPC INTERN ⊂ IPC INTERNATIONAL) scores high via Jaro-Winkler."""
        a = _make_record_obj(id=1, normalized_name="A", fields={"supplier_name": "A", "short_name": "IPC INTERN"})
        b = _make_record_obj(
            id=2, normalized_name="B", fields={"supplier_name": "B", "short_name": "IPC INTERNATIONAL"}
        )
        result = score_pair(a, b)
        # Prefix match should not be penalized to 0.0 (the old exact-equality behavior)
        assert result["signals"][JW_SHORT] > 0.85

    def test_different_short_name_low_score(self):
        """Completely different short_names score low."""
        a = _make_record_obj(id=1, normalized_name="A", fields={"supplier_name": "A", "short_name": "ACM"})
        b = _make_record_obj(id=2, normalized_name="B", fields={"supplier_name": "B", "short_name": "ZPH"})
        result = score_pair(a, b)
        assert result["signals"][JW_SHORT] < 0.5

    def test_none_short_name_dropped(self):
        """jaro_winkler:short_name is omitted when one side is None."""
        a = _make_record_obj(id=1, normalized_name="A", fields={"supplier_name": "A", "short_name": "ACM"})
        b = _make_record_obj(id=2, normalized_name="B", fields={"supplier_name": "B"})
        result = score_pair(a, b)
        assert JW_SHORT not in result["signals"]

    def test_same_contact_match(self):
        """Same contact_name returns high score via jaro_winkler."""
        a = _make_record_obj(id=1, normalized_name="A", fields={"supplier_name": "A", "contact_name": "John Smith"})
        b = _make_record_obj(id=2, normalized_name="B", fields={"supplier_name": "B", "contact_name": "John Smith"})
        result = score_pair(a, b)
        assert result["signals"][JW_CONTACT] >= 0.99

    def test_different_contact_jaro_winkler(self):
        """Different contact_name returns Jaro-Winkler similarity."""
        a = _make_record_obj(id=1, normalized_name="A", fields={"supplier_name": "A", "contact_name": "John Smith"})
        b = _make_record_obj(id=2, normalized_name="B", fields={"supplier_name": "B", "contact_name": "Jane Doe"})
        result = score_pair(a, b)
        assert 0.0 <= result["signals"][JW_CONTACT] <= 1.0
        assert result["signals"][JW_CONTACT] < 0.8  # Should be low for very different names

    def test_none_contact_dropped(self):
        """jaro_winkler:contact_name is omitted when one side is None."""
        a = _make_record_obj(id=1, normalized_name="A", fields={"supplier_name": "A", "contact_name": "John Smith"})
        b = _make_record_obj(id=2, normalized_name="B", fields={"supplier_name": "B"})
        result = score_pair(a, b)
        assert JW_CONTACT not in result["signals"]

    def test_embedding_cosine_with_embeddings(self):
        """With embeddings, embedding_cosine computed via dot product."""
        # L2-normalized vectors — dot product = cosine similarity
        emb_a = np.array([1.0, 0.0, 0.0], dtype=np.float32)
        emb_b = np.array([1.0, 0.0, 0.0], dtype=np.float32)
        a = _make_record_obj(id=1, normalized_name="A", name_embedding=emb_a, fields={"supplier_name": "A"})
        b = _make_record_obj(id=2, normalized_name="B", name_embedding=emb_b, fields={"supplier_name": "B"})
        result = score_pair(a, b)
        assert result["signals"][EMB_NAME] >= 0.99

    def test_embedding_cosine_orthogonal(self):
        """Orthogonal embeddings produce embedding_cosine ≈ 0.0."""
        emb_a = np.array([1.0, 0.0, 0.0], dtype=np.float32)
        emb_b = np.array([0.0, 1.0, 0.0], dtype=np.float32)
        a = _make_record_obj(id=1, normalized_name="A", name_embedding=emb_a, fields={"supplier_name": "A"})
        b = _make_record_obj(id=2, normalized_name="B", name_embedding=emb_b, fields={"supplier_name": "B"})
        result = score_pair(a, b)
        assert abs(result["signals"][EMB_NAME]) < 0.01

    def test_embedding_cosine_none_neutral(self):
        """No embeddings returns 0.5 (neutral fallback in _embedding_cosine)."""
        a = _make_record_obj(id=1, normalized_name="A", name_embedding=None, fields={"supplier_name": "A"})
        b = _make_record_obj(id=2, normalized_name="B", name_embedding=None, fields={"supplier_name": "B"})
        result = score_pair(a, b)
        # name field present on both sides → signal fires; no embedding → 0.5 neutral
        assert result["signals"][EMB_NAME] == 0.5

    def test_embedding_cosine_drops_when_name_missing(self):
        """embedding_cosine is dropped when the name field is absent, preventing empty-name false positives."""
        import numpy as np

        vec = np.array([1.0, 0.0, 0.0], dtype=np.float32)
        a = _make_record_obj(id=1, normalized_name="", name_embedding=vec, fields={})
        b = _make_record_obj(id=2, normalized_name="", name_embedding=vec, fields={})
        result = score_pair(a, b)
        assert EMB_NAME not in result["signals"]


class TestScorePairAggregation:
    """Test weighted confidence computation."""

    def test_returns_confidence_and_signals(self):
        """score_pair returns dict with 'confidence' and 'signals' keys."""
        a = _make_record_obj(id=1, normalized_name="ACME CORP", fields={"supplier_name": "ACME CORP"})
        b = _make_record_obj(id=2, normalized_name="ACME INDUSTRIES", fields={"supplier_name": "ACME INDUSTRIES"})
        result = score_pair(a, b)
        assert "confidence" in result
        assert "signals" in result
        assert isinstance(result["confidence"], float)
        assert isinstance(result["signals"], dict)

    def test_all_six_signals_present_when_fully_populated(self):
        """All 6 signal keys present when both records have every optional field."""
        a = _make_record_obj(
            id=1,
            normalized_name="ACME CORP",
            fields={
                "supplier_name": "ACME CORP",
                "short_name": "ACM",
                "currency": "USD",
                "contact_name": "John",
            },
        )
        b = _make_record_obj(
            id=2,
            normalized_name="ACME INDUSTRIES",
            fields={
                "supplier_name": "ACME INDUSTRIES",
                "short_name": "ACI",
                "currency": "USD",
                "contact_name": "Jane",
            },
        )
        result = score_pair(a, b)
        expected_keys = {
            JW_NAME,
            TJ_NAME,
            EMB_NAME,
            JW_SHORT,
            EXACT_CURRENCY,
            JW_CONTACT,
        }
        assert set(result["signals"].keys()) == expected_keys

    def test_only_core_signals_when_optionals_missing(self):
        """Only the 3 core signals appear when no optional fields are populated."""
        a = _make_record_obj(id=1, normalized_name="ACME CORP", fields={"supplier_name": "ACME CORP"})
        b = _make_record_obj(id=2, normalized_name="ACME INDUSTRIES", fields={"supplier_name": "ACME INDUSTRIES"})
        result = score_pair(a, b)
        assert set(result["signals"].keys()) == {JW_NAME, TJ_NAME, EMB_NAME}

    def test_all_signals_0_to_1(self):
        """All signal values are between 0.0 and 1.0 inclusive."""
        a = _make_record_obj(
            id=1,
            normalized_name="ACME CORP",
            fields={
                "supplier_name": "ACME CORP",
                "currency": "USD",
                "short_name": "ACM",
                "contact_name": "John",
            },
        )
        b = _make_record_obj(
            id=2,
            normalized_name="BETA INC",
            fields={
                "supplier_name": "BETA INC",
                "currency": "EUR",
                "short_name": "BET",
                "contact_name": "Jane",
            },
        )
        result = score_pair(a, b)
        for signal_name, value in result["signals"].items():
            assert 0.0 <= value <= 1.0, f"Signal {signal_name} out of range: {value}"

    def test_confidence_is_weighted_sum_over_total_weight(self):
        """confidence equals weighted sum of active signals divided by *total* configured weight.

        Dividing by total (not active) weight means pairs with few firing signals cannot
        reach 1.0 on a single weak match — e.g. same currency alone yields 0.05/1.00 = 5%.
        """
        a = _make_record_obj(
            id=1,
            normalized_name="TEST COMPANY",
            fields={
                "supplier_name": "TEST COMPANY",
                "short_name": "TST",
                "currency": "USD",
                "contact_name": "Alice",
            },
        )
        b = _make_record_obj(
            id=2,
            normalized_name="TEST COMPANY",
            fields={
                "supplier_name": "TEST COMPANY",
                "short_name": "TST",
                "currency": "USD",
                "contact_name": "Alice",
            },
        )
        result = score_pair(a, b)

        from app.record_types import get as get_record_type

        rt = get_record_type("supplier")
        sig_map = {signal_key(s.kind, s.field): s.weight for s in rt.signals}

        total_weight = sum(s.weight for s in rt.signals)
        expected = sum(v * sig_map[k] for k, v in result["signals"].items() if k in sig_map) / total_weight
        assert abs(result["confidence"] - expected) < 0.001

    def test_confidence_not_inflated_when_optional_missing(self):
        """Missing optional fields reduce confidence — they do NOT renormalize upward.

        Dividing by total weight (not active weight) means a pair with no optional fields
        is penalized for lacking data. Identical names with no embedding/optional fields
        still score above 0.5 because the three name signals dominate, but never reach 1.0.
        """
        # Identical names — core signals all max out at ~1.0; embedding is 0.5
        # (no embeddings provided). With contact_name None on one side, the
        # contact signal must be dropped from the weighted sum.
        a = _make_record_obj(id=1, normalized_name="ACME CORPORATION", fields={"supplier_name": "ACME CORPORATION"})
        b = _make_record_obj(id=2, normalized_name="ACME CORPORATION", fields={"supplier_name": "ACME CORPORATION"})
        result = score_pair(a, b)

        # contact signal must not appear in the active set
        assert JW_CONTACT not in result["signals"]

        # jw≈1.0×0.30 + tj≈1.0×0.20 + emb=0.5×0.25 = 0.625 / 1.00 total weight = 0.625
        assert result["confidence"] > 0.5
        assert result["confidence"] < 1.0

    def test_confidence_0_to_1(self):
        """Confidence is between 0.0 and 1.0."""
        a = _make_record_obj(id=1, normalized_name="ACME CORP", fields={"supplier_name": "ACME CORP"})
        b = _make_record_obj(id=2, normalized_name="BETA INC", fields={"supplier_name": "BETA INC"})
        result = score_pair(a, b)
        assert 0.0 <= result["confidence"] <= 1.0

    def test_currency_case_insensitive(self):
        """Currency comparison is case-insensitive."""
        a = _make_record_obj(id=1, normalized_name="A", fields={"supplier_name": "A", "currency": "usd"})
        b = _make_record_obj(id=2, normalized_name="B", fields={"supplier_name": "B", "currency": "USD"})
        result = score_pair(a, b)
        assert result["signals"][EXACT_CURRENCY] == 1.0
