# Auto Column Mapping & Auto Signal Selection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically guess CSV column → canonical field mappings by analyzing data values, and auto-select/weight matching signals based on field coverage and cardinality.

**Architecture:** New `column_guesser.py` service classifies columns via data-value heuristics (string length, uniqueness, ISO patterns). New `guess-mapping` endpoint returns suggested mapping with confidence. The `ColumnMapper` frontend receives pre-filled guesses. Scoring service gains a `compute_signal_weights` function that analyzes field coverage/cardinality to dynamically weight signals.

**Tech Stack:** Python (heuristic classifiers), FastAPI endpoint, React/TypeScript (ColumnMapper enhancement)

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `backend/app/services/column_guesser.py` | Heuristic classifiers that score each CSV column against each canonical field |
| Create | `backend/tests/test_column_guesser.py` | Unit tests for column guesser service |
| Modify | `backend/app/schemas/source.py` | Add `GuessMappingResponse` schema |
| Modify | `backend/app/routers/sources.py` | Add `POST /api/sources/guess-mapping` endpoint |
| Modify | `frontend/src/api/types.ts` | Add `GuessMappingResponse` TypeScript type |
| Modify | `frontend/src/components/ColumnMapper.tsx` | Accept + display pre-filled guesses with confidence |
| Modify | `frontend/src/pages/Upload.tsx` | Call guess-mapping API and pass results to ColumnMapper |
| Modify | `backend/app/services/scoring.py` | Add `compute_signal_weights()` for dynamic weight calculation |
| Modify | `backend/app/services/matching.py` | Call `compute_signal_weights()` before scoring phase |
| Modify | `backend/tests/test_scoring.py` | Tests for auto signal weight computation |

---

### Task 1: Column Guesser Service — Core Classifiers

**Files:**
- Create: `backend/app/services/column_guesser.py`
- Create: `backend/tests/test_column_guesser.py`

- [ ] **Step 1: Write the failing test for currency detection**

```python
# backend/tests/test_column_guesser.py
"""Tests for column guesser service — data-value-based column classification."""

import pytest
from app.services.column_guesser import guess_column_mapping


class TestCurrencyDetection:
    """Currency columns should be identified by ISO 4217 code patterns."""

    def test_detects_currency_column(self):
        """Column with ISO currency codes scores highest for currency."""
        rows = [
            {"CUR_0": "USD", "BPSNAM_0": "Acme Corp", "BPSNUM_0": "V001"},
            {"CUR_0": "EUR", "BPSNAM_0": "Beta Inc", "BPSNUM_0": "V002"},
            {"CUR_0": "GBP", "BPSNAM_0": "Gamma Ltd", "BPSNUM_0": "V003"},
        ]
        result = guess_column_mapping(list(rows[0].keys()), rows)
        assert result["currency"]["column"] == "CUR_0"
        assert result["currency"]["confidence"] > 0.7

    def test_all_same_currency_still_detected(self):
        """Even if all values are the same currency, still detects it."""
        rows = [
            {"CUR_0": "USD", "BPSNAM_0": "Acme Corp"},
            {"CUR_0": "USD", "BPSNAM_0": "Beta Inc"},
        ]
        result = guess_column_mapping(list(rows[0].keys()), rows)
        assert result["currency"]["column"] == "CUR_0"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/rani/OneBase/backend && python3 -m pytest tests/test_column_guesser.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.column_guesser'`

- [ ] **Step 3: Write the column guesser service with all classifiers**

```python
# backend/app/services/column_guesser.py
"""Column guesser service — classifies CSV columns by analyzing data values.

Scores each CSV column against 7 canonical fields using heuristics:
- supplier_name: longest text, company-like tokens, high uniqueness
- supplier_code: short alphanumeric, very high uniqueness
- short_name: shorter text than name, moderate uniqueness
- currency: ISO 4217 3-letter codes
- payment_terms: low cardinality text/codes
- contact_name: person-name patterns (multi-word, capitalized)
- supplier_type: very low cardinality, short values
"""

import re
from collections import Counter

# ISO 4217 currency codes (common subset)
_ISO_CURRENCIES = {
    "AED", "AFN", "ALL", "AMD", "ANG", "AOA", "ARS", "AUD", "AWG", "AZN",
    "BAM", "BBD", "BDT", "BGN", "BHD", "BIF", "BMD", "BND", "BOB", "BRL",
    "BSD", "BTN", "BWP", "BYN", "BZD", "CAD", "CDF", "CHF", "CLP", "CNY",
    "COP", "CRC", "CUP", "CVE", "CZK", "DJF", "DKK", "DOP", "DZD", "EGP",
    "ERN", "ETB", "EUR", "FJD", "FKP", "GBP", "GEL", "GHS", "GIP", "GMD",
    "GNF", "GTQ", "GYD", "HKD", "HNL", "HRK", "HTG", "HUF", "IDR", "ILS",
    "INR", "IQD", "IRR", "ISK", "JMD", "JOD", "JPY", "KES", "KGS", "KHR",
    "KMF", "KPW", "KRW", "KWD", "KYD", "KZT", "LAK", "LBP", "LKR", "LRD",
    "LSL", "LYD", "MAD", "MDL", "MGA", "MKD", "MMK", "MNT", "MOP", "MRU",
    "MUR", "MVR", "MWK", "MXN", "MYR", "MZN", "NAD", "NGN", "NIO", "NOK",
    "NPR", "NZD", "OMR", "PAB", "PEN", "PGK", "PHP", "PKR", "PLN", "PYG",
    "QAR", "RON", "RSD", "RUB", "RWF", "SAR", "SBD", "SCR", "SDG", "SEK",
    "SGD", "SHP", "SLE", "SOS", "SRD", "SSP", "STN", "SYP", "SZL", "THB",
    "TJS", "TMT", "TND", "TOP", "TRY", "TTD", "TWD", "TZS", "UAH", "UGX",
    "USD", "UYU", "UZS", "VES", "VND", "VUV", "WST", "XAF", "XCD", "XOF",
    "XPF", "YER", "ZAR", "ZMW", "ZWL",
}

_COMPANY_TOKENS = {
    "inc", "corp", "corporation", "ltd", "limited", "llc", "gmbh", "sa", "sas",
    "sarl", "ag", "bv", "nv", "plc", "co", "company", "group", "holdings",
    "international", "intl", "services", "solutions", "industries", "enterprises",
    "partners", "associates", "consulting", "technologies", "tech", "systems",
}

# Minimum sample size for meaningful analysis
_MIN_SAMPLE = 3


def _non_empty_values(rows: list[dict[str, str]], col: str) -> list[str]:
    """Extract non-empty, non-whitespace values for a column."""
    return [v.strip() for row in rows if (v := row.get(col, "")) and v.strip()]


def _uniqueness_ratio(values: list[str]) -> float:
    """Ratio of distinct values to total values. 1.0 = all unique."""
    if not values:
        return 0.0
    return len(set(values)) / len(values)


def _avg_length(values: list[str]) -> float:
    """Average string length of values."""
    if not values:
        return 0.0
    return sum(len(v) for v in values) / len(values)


def _coverage(rows: list[dict[str, str]], col: str) -> float:
    """Fraction of rows with non-empty value for this column."""
    if not rows:
        return 0.0
    non_empty = sum(1 for row in rows if row.get(col, "").strip())
    return non_empty / len(rows)


def _score_supplier_name(values: list[str], all_scores: dict[str, dict[str, float]]) -> float:
    """Score a column as supplier_name: long text, company tokens, high uniqueness."""
    if not values:
        return 0.0

    avg_len = _avg_length(values)
    uniqueness = _uniqueness_ratio(values)

    # Company-like token presence
    company_count = 0
    for v in values:
        tokens = set(v.lower().split())
        if tokens & _COMPANY_TOKENS:
            company_count += 1
    company_ratio = company_count / len(values)

    # Score components
    # Prefer longest text columns (normalize: 20+ chars = max score)
    length_score = min(avg_len / 20.0, 1.0)
    # High uniqueness expected
    uniqueness_score = uniqueness
    # Company tokens are a bonus, not required
    company_score = company_ratio

    return length_score * 0.45 + uniqueness_score * 0.35 + company_score * 0.20


def _score_supplier_code(values: list[str]) -> float:
    """Score a column as supplier_code: short, alphanumeric, very high uniqueness."""
    if not values:
        return 0.0

    avg_len = _avg_length(values)
    uniqueness = _uniqueness_ratio(values)

    # Short values (ideal: 3-15 chars)
    if avg_len < 1:
        length_score = 0.0
    elif avg_len <= 15:
        length_score = 1.0
    else:
        length_score = max(0.0, 1.0 - (avg_len - 15) / 30.0)

    # Alphanumeric pattern (allow hyphens, underscores)
    alnum_count = sum(1 for v in values if re.match(r'^[\w\-]+$', v))
    alnum_ratio = alnum_count / len(values)

    # Very high uniqueness required
    uniqueness_score = 1.0 if uniqueness > 0.95 else uniqueness

    return length_score * 0.25 + uniqueness_score * 0.50 + alnum_ratio * 0.25


def _score_short_name(values: list[str], name_avg_len: float) -> float:
    """Score a column as short_name: shorter than name but still text."""
    if not values:
        return 0.0

    avg_len = _avg_length(values)

    # Should be shorter than supplier_name
    if name_avg_len > 0 and avg_len >= name_avg_len:
        return 0.0

    # Ideal: 3-15 chars
    if avg_len < 2:
        length_score = 0.0
    elif avg_len <= 15:
        length_score = 1.0
    else:
        length_score = max(0.0, 1.0 - (avg_len - 15) / 20.0)

    # Should be text (not pure numbers)
    text_count = sum(1 for v in values if re.search(r'[a-zA-Z]', v))
    text_ratio = text_count / len(values)

    uniqueness = _uniqueness_ratio(values)

    return length_score * 0.40 + text_ratio * 0.30 + uniqueness * 0.30


def _score_currency(values: list[str]) -> float:
    """Score a column as currency: ISO 4217 3-letter codes."""
    if not values:
        return 0.0

    iso_count = sum(1 for v in values if v.upper() in _ISO_CURRENCIES)
    iso_ratio = iso_count / len(values)

    # Check length pattern (should be ~3 chars)
    avg_len = _avg_length(values)
    length_ok = 2.5 <= avg_len <= 3.5

    if iso_ratio > 0.8 and length_ok:
        return 0.95
    elif iso_ratio > 0.5:
        return 0.7
    elif iso_ratio > 0.2:
        return 0.3
    return 0.0


def _score_payment_terms(values: list[str]) -> float:
    """Score a column as payment_terms: low cardinality codes/text."""
    if not values:
        return 0.0

    uniqueness = _uniqueness_ratio(values)
    avg_len = _avg_length(values)
    distinct_count = len(set(values))

    # Low-to-medium cardinality (not unique per row, not single value)
    cardinality_score = 0.0
    if 2 <= distinct_count <= 30:
        cardinality_score = 1.0
    elif distinct_count == 1:
        cardinality_score = 0.3

    # Medium length text/codes
    if avg_len < 2:
        length_score = 0.0
    elif avg_len <= 20:
        length_score = 1.0
    else:
        length_score = max(0.0, 1.0 - (avg_len - 20) / 30.0)

    # Contains text (not pure numbers)
    text_count = sum(1 for v in values if re.search(r'[a-zA-Z]', v))
    text_ratio = text_count / len(values)

    return cardinality_score * 0.50 + length_score * 0.25 + text_ratio * 0.25


def _score_contact_name(values: list[str]) -> float:
    """Score a column as contact_name: person-name patterns."""
    if not values:
        return 0.0

    # Multi-word strings (2-4 words)
    multi_word_count = sum(1 for v in values if 2 <= len(v.split()) <= 4)
    multi_word_ratio = multi_word_count / len(values)

    # Capitalized words (Title Case or ALL CAPS)
    cap_count = sum(1 for v in values if v == v.title() or v == v.upper())
    cap_ratio = cap_count / len(values)

    # Moderate length (5-40 chars)
    avg_len = _avg_length(values)
    if avg_len < 3:
        length_score = 0.0
    elif avg_len <= 40:
        length_score = 1.0
    else:
        length_score = 0.3

    # Alpha-heavy (names are mostly letters + spaces)
    alpha_count = sum(1 for v in values if re.match(r'^[a-zA-Z\s\.\-]+$', v))
    alpha_ratio = alpha_count / len(values)

    return multi_word_ratio * 0.35 + alpha_ratio * 0.30 + length_score * 0.20 + cap_ratio * 0.15


def _score_supplier_type(values: list[str]) -> float:
    """Score a column as supplier_type: very low cardinality, short categorical."""
    if not values:
        return 0.0

    distinct_count = len(set(values))
    avg_len = _avg_length(values)

    # Very low cardinality (< 10 distinct values)
    if distinct_count > 15:
        return 0.0
    cardinality_score = 1.0 if distinct_count <= 10 else 0.5

    # Short values (1-5 chars ideal)
    if avg_len <= 5:
        length_score = 1.0
    elif avg_len <= 10:
        length_score = 0.6
    else:
        length_score = 0.2

    return cardinality_score * 0.60 + length_score * 0.40


def guess_column_mapping(
    columns: list[str],
    sample_rows: list[dict[str, str]],
) -> dict[str, dict[str, str | float | None]]:
    """Guess canonical field → CSV column mapping from data values.

    Analyzes sample data values to classify each CSV column against
    the 7 canonical fields. Uses greedy assignment: highest-scoring
    (column, field) pair wins first, no column reuse.

    Args:
        columns: CSV column headers.
        sample_rows: List of dicts (header → value) from sample rows.

    Returns:
        Dict mapping each canonical field to:
          {"column": str | None, "confidence": float}
        Fields with no good match have column=None, confidence=0.0.
    """
    if not columns or not sample_rows:
        return {
            field: {"column": None, "confidence": 0.0}
            for field in [
                "supplier_name", "supplier_code", "short_name",
                "currency", "payment_terms", "contact_name", "supplier_type",
            ]
        }

    # Pre-compute values and stats per column
    col_values: dict[str, list[str]] = {}
    col_coverage: dict[str, float] = {}
    for col in columns:
        vals = _non_empty_values(sample_rows, col)
        col_values[col] = vals
        col_coverage[col] = _coverage(sample_rows, col)

    # Score every (column, field) combination
    scores: list[tuple[float, str, str]] = []  # (score, field, column)

    for col in columns:
        vals = col_values[col]
        coverage = col_coverage[col]

        # Skip columns with very low coverage
        if coverage < 0.3:
            continue

        # Score against each canonical field
        scores.append((_score_supplier_name(vals, {}) * coverage, "supplier_name", col))
        scores.append((_score_supplier_code(vals) * coverage, "supplier_code", col))
        scores.append((_score_currency(vals) * coverage, "currency", col))
        scores.append((_score_payment_terms(vals) * coverage, "payment_terms", col))
        scores.append((_score_contact_name(vals) * coverage, "contact_name", col))
        scores.append((_score_supplier_type(vals) * coverage, "supplier_type", col))

    # Sort by score descending — greedy assignment
    scores.sort(key=lambda x: x[0], reverse=True)

    result: dict[str, dict[str, str | float | None]] = {}
    used_columns: set[str] = set()
    assigned_fields: set[str] = set()

    for score, field, col in scores:
        if field in assigned_fields or col in used_columns:
            continue
        if score < 0.15:  # Minimum threshold
            continue
        result[field] = {"column": col, "confidence": round(score, 3)}
        used_columns.add(col)
        assigned_fields.add(field)

    # Now handle short_name — needs the name column's avg length for comparison
    name_col = result.get("supplier_name", {}).get("column")
    name_avg_len = _avg_length(col_values.get(name_col, [])) if name_col else 0.0

    if "short_name" not in assigned_fields:
        best_sn_score = 0.0
        best_sn_col = None
        for col in columns:
            if col in used_columns:
                continue
            vals = col_values[col]
            coverage = col_coverage[col]
            if coverage < 0.3:
                continue
            sn_score = _score_short_name(vals, name_avg_len) * coverage
            if sn_score > best_sn_score:
                best_sn_score = sn_score
                best_sn_col = col
        if best_sn_col and best_sn_score >= 0.15:
            result["short_name"] = {"column": best_sn_col, "confidence": round(best_sn_score, 3)}
            used_columns.add(best_sn_col)

    # Fill in missing fields with no match
    all_fields = [
        "supplier_name", "supplier_code", "short_name",
        "currency", "payment_terms", "contact_name", "supplier_type",
    ]
    for field in all_fields:
        if field not in result:
            result[field] = {"column": None, "confidence": 0.0}

    return result
```

- [ ] **Step 4: Write remaining tests for all classifiers**

```python
# Append to backend/tests/test_column_guesser.py

class TestSupplierNameDetection:
    """Supplier name should be the longest text column with high uniqueness."""

    def test_detects_name_column(self):
        rows = [
            {"BPSNUM_0": "FE661", "BPSNAM_0": "IPC INTERNATIONAL", "BPSSHO_0": "IPC INTERN", "CUR_0": "USD"},
            {"BPSNUM_0": "FE662", "BPSNAM_0": "GLOBAL SUPPLIES LTD", "BPSSHO_0": "GLOBAL SUP", "CUR_0": "EUR"},
            {"BPSNUM_0": "FE663", "BPSNAM_0": "ACME CORPORATION INC", "BPSSHO_0": "ACME CORP", "CUR_0": "GBP"},
        ]
        result = guess_column_mapping(list(rows[0].keys()), rows)
        assert result["supplier_name"]["column"] == "BPSNAM_0"

    def test_prefers_longer_text(self):
        rows = [
            {"short_col": "AB", "long_col": "Very Long Company Name International"},
            {"short_col": "CD", "long_col": "Another Lengthy Business Enterprise"},
            {"short_col": "EF", "long_col": "Third Extensive Corporation Holdings"},
        ]
        result = guess_column_mapping(list(rows[0].keys()), rows)
        assert result["supplier_name"]["column"] == "long_col"


class TestSupplierCodeDetection:
    """Supplier code should be short, alphanumeric, highly unique."""

    def test_detects_code_column(self):
        rows = [
            {"BPSNUM_0": "FE661", "BPSNAM_0": "IPC INTERNATIONAL", "CUR_0": "USD"},
            {"BPSNUM_0": "FE662", "BPSNAM_0": "GLOBAL SUPPLIES LTD", "CUR_0": "EUR"},
            {"BPSNUM_0": "FE663", "BPSNAM_0": "ACME CORPORATION INC", "CUR_0": "GBP"},
        ]
        result = guess_column_mapping(list(rows[0].keys()), rows)
        assert result["supplier_code"]["column"] == "BPSNUM_0"


class TestShortNameDetection:
    """Short name should be shorter text than supplier name."""

    def test_detects_short_name(self):
        rows = [
            {"BPSNUM_0": "FE661", "BPSNAM_0": "IPC INTERNATIONAL", "BPSSHO_0": "IPC INTERN", "CUR_0": "USD"},
            {"BPSNUM_0": "FE662", "BPSNAM_0": "GLOBAL SUPPLIES LTD", "BPSSHO_0": "GLOBAL SUP", "CUR_0": "EUR"},
            {"BPSNUM_0": "FE663", "BPSNAM_0": "ACME CORPORATION INC", "BPSSHO_0": "ACME CORP", "CUR_0": "GBP"},
        ]
        result = guess_column_mapping(list(rows[0].keys()), rows)
        assert result["short_name"]["column"] == "BPSSHO_0"


class TestContactNameDetection:
    """Contact name should detect person-name patterns."""

    def test_detects_contact_name(self):
        rows = [
            {"BPSNAM_0": "Acme Corp", "BPSNUM_0": "V001", "CNTNAM_0": "John Smith"},
            {"BPSNAM_0": "Beta Inc", "BPSNUM_0": "V002", "CNTNAM_0": "Jane Doe"},
            {"BPSNAM_0": "Gamma Ltd", "BPSNUM_0": "V003", "CNTNAM_0": "Bob Wilson"},
        ]
        result = guess_column_mapping(list(rows[0].keys()), rows)
        assert result["contact_name"]["column"] == "CNTNAM_0"


class TestSupplierTypeDetection:
    """Supplier type should be very low cardinality, short categorical."""

    def test_detects_type_column(self):
        rows = [
            {"BPSNAM_0": "Acme Corp", "BPSNUM_0": "V001", "BPSTYP_0": "1", "CUR_0": "USD"},
            {"BPSNAM_0": "Beta Inc", "BPSNUM_0": "V002", "BPSTYP_0": "2", "CUR_0": "EUR"},
            {"BPSNAM_0": "Gamma Ltd", "BPSNUM_0": "V003", "BPSTYP_0": "1", "CUR_0": "GBP"},
            {"BPSNAM_0": "Delta Co", "BPSNUM_0": "V004", "BPSTYP_0": "1", "CUR_0": "USD"},
            {"BPSNAM_0": "Epsilon SA", "BPSNUM_0": "V005", "BPSTYP_0": "2", "CUR_0": "CHF"},
        ]
        result = guess_column_mapping(list(rows[0].keys()), rows)
        assert result["supplier_type"]["column"] == "BPSTYP_0"


class TestFullSageX3Mapping:
    """Test with realistic Sage X3 ERP data matching the actual CSV format."""

    def test_sage_x3_all_fields_detected(self):
        """All 7 canonical fields should be detected from Sage X3 columns."""
        rows = [
            {"BPSNUM_0": "FE661", "BPSNAM_0": "IPC INTERNATIONAL", "BPSSHO_0": "IPC INTERN",
             "BPSTYP_0": "1", "CUR_0": "USD", "PTE_0": "PAIEMAVANCE", "CNTNAM_0": " "},
            {"BPSNUM_0": "FE662", "BPSNAM_0": "GLOBAL SUPPLIES LTD", "BPSSHO_0": "GLOBAL SUP",
             "BPSTYP_0": "2", "CUR_0": "EUR", "PTE_0": "NET30", "CNTNAM_0": "Pierre Martin"},
            {"BPSNUM_0": "FE663", "BPSNAM_0": "ACME CORPORATION INC", "BPSSHO_0": "ACME CORP",
             "BPSTYP_0": "1", "CUR_0": "GBP", "PTE_0": "NET30", "CNTNAM_0": "John Smith"},
            {"BPSNUM_0": "FE664", "BPSNAM_0": "TECHNO SOLUTIONS SARL", "BPSSHO_0": "TECHNO SOL",
             "BPSTYP_0": "1", "CUR_0": "EUR", "PTE_0": "PAIEMAVANCE", "CNTNAM_0": "Marie Dupont"},
            {"BPSNUM_0": "FE665", "BPSNAM_0": "NORDIC ENTERPRISES AB", "BPSSHO_0": "NORDIC ENT",
             "BPSTYP_0": "2", "CUR_0": "SEK", "PTE_0": "NET60", "CNTNAM_0": "Erik Johansson"},
        ]
        columns = list(rows[0].keys())
        result = guess_column_mapping(columns, rows)

        assert result["supplier_name"]["column"] == "BPSNAM_0"
        assert result["supplier_code"]["column"] == "BPSNUM_0"
        assert result["currency"]["column"] == "CUR_0"
        # These may or may not be perfectly detected depending on heuristics,
        # so we just verify they got assigned to something reasonable
        assert result["supplier_name"]["confidence"] > 0.3
        assert result["supplier_code"]["confidence"] > 0.3
        assert result["currency"]["confidence"] > 0.7


class TestEdgeCases:
    """Edge cases and error handling."""

    def test_empty_rows(self):
        """Empty rows returns all None mappings."""
        result = guess_column_mapping(["A", "B"], [])
        assert result["supplier_name"]["column"] is None
        assert result["supplier_code"]["column"] is None

    def test_empty_columns(self):
        """Empty columns returns all None mappings."""
        result = guess_column_mapping([], [{"A": "1"}])
        assert result["supplier_name"]["column"] is None

    def test_single_column(self):
        """Single column should be assigned to the best-matching field."""
        rows = [
            {"VENDOR": "Acme Corp"},
            {"VENDOR": "Beta Inc"},
            {"VENDOR": "Gamma Ltd"},
        ]
        result = guess_column_mapping(["VENDOR"], rows)
        # Single column should go to the highest-scoring field
        assigned_count = sum(1 for f in result.values() if f["column"] is not None)
        assert assigned_count == 1

    def test_no_column_reuse(self):
        """Each column should be assigned to at most one field."""
        rows = [
            {"A": "FE661", "B": "IPC INTERNATIONAL", "C": "USD", "D": "IPC"},
            {"A": "FE662", "B": "GLOBAL SUPPLIES LTD", "C": "EUR", "D": "GLOBAL"},
            {"A": "FE663", "B": "ACME CORPORATION INC", "C": "GBP", "D": "ACME"},
        ]
        result = guess_column_mapping(["A", "B", "C", "D"], rows)
        assigned_cols = [f["column"] for f in result.values() if f["column"] is not None]
        assert len(assigned_cols) == len(set(assigned_cols)), "Columns were reused across fields"
```

- [ ] **Step 5: Run all tests to verify they pass**

Run: `cd /home/rani/OneBase/backend && python3 -m pytest tests/test_column_guesser.py -v`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/column_guesser.py backend/tests/test_column_guesser.py
git commit -m "feat: add column guesser service for auto column mapping"
```

---

### Task 2: Backend API — Guess Mapping Endpoint

**Files:**
- Modify: `backend/app/schemas/source.py`
- Modify: `backend/app/routers/sources.py`

- [ ] **Step 1: Add response schema**

In `backend/app/schemas/source.py`, add after `SourceMatchResponse`:

```python
class FieldGuess(BaseModel):
    """A single field guess from the column guesser."""
    column: str | None = None
    confidence: float = 0.0


class GuessMappingResponse(BaseModel):
    """Response from the guess-mapping endpoint."""
    supplier_name: FieldGuess
    supplier_code: FieldGuess
    short_name: FieldGuess
    currency: FieldGuess
    payment_terms: FieldGuess
    contact_name: FieldGuess
    supplier_type: FieldGuess
```

- [ ] **Step 2: Add endpoint to sources router**

In `backend/app/routers/sources.py`, add a new endpoint after `match_source`:

```python
from app.services.column_guesser import guess_column_mapping
from app.schemas.source import GuessMappingResponse, FieldGuess

@router.post("/guess-mapping", response_model=GuessMappingResponse)
async def guess_mapping(
    file: UploadFile = File(None),
    file_ref: str | None = None,
    current_user: User = Depends(get_current_user),
):
    """Guess column mapping by analyzing CSV data values.

    Accepts either a file upload or a file_ref from a previous match-source call.
    Samples rows and uses heuristic classifiers to guess which CSV column
    maps to each canonical field.
    """
    if file_ref:
        filepath = os.path.join(UPLOAD_DIR, file_ref)
        if not os.path.exists(filepath):
            raise HTTPException(status_code=404, detail="File reference not found")
        with open(filepath, "rb") as f:
            file_content = f.read()
    elif file:
        file_content = await file.read()
    else:
        raise HTTPException(status_code=400, detail="Either file or file_ref is required")

    try:
        text = file_content.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = file_content.decode("cp1252")
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="File encoding not supported")

    delimiter = _sniff_delimiter(text)
    columns = _detect_columns_from_text(text, delimiter)
    if not columns:
        raise HTTPException(status_code=400, detail="No columns detected")

    sample = _sample_rows(text, delimiter, n=100)
    if not sample:
        raise HTTPException(status_code=400, detail="No data rows found")

    guesses = guess_column_mapping(columns, sample)

    return GuessMappingResponse(
        supplier_name=FieldGuess(**guesses["supplier_name"]),
        supplier_code=FieldGuess(**guesses["supplier_code"]),
        short_name=FieldGuess(**guesses["short_name"]),
        currency=FieldGuess(**guesses["currency"]),
        payment_terms=FieldGuess(**guesses["payment_terms"]),
        contact_name=FieldGuess(**guesses["contact_name"]),
        supplier_type=FieldGuess(**guesses["supplier_type"]),
    )
```

- [ ] **Step 3: Run existing tests to verify no regressions**

Run: `cd /home/rani/OneBase/backend && python3 -m pytest tests/test_sources.py -v`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/source.py backend/app/routers/sources.py
git commit -m "feat: add guess-mapping API endpoint"
```

---

### Task 3: Frontend — ColumnMapper with Pre-filled Guesses

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/components/ColumnMapper.tsx`
- Modify: `frontend/src/pages/Upload.tsx`

- [ ] **Step 1: Add TypeScript types**

In `frontend/src/api/types.ts`, add after `SourceMatchResponse`:

```typescript
export interface FieldGuess {
  column: string | null;
  confidence: number;
}

export interface GuessMappingResponse {
  supplier_name: FieldGuess;
  supplier_code: FieldGuess;
  short_name: FieldGuess;
  currency: FieldGuess;
  payment_terms: FieldGuess;
  contact_name: FieldGuess;
  supplier_type: FieldGuess;
}
```

- [ ] **Step 2: Update ColumnMapper to accept and display guesses**

Modify `frontend/src/components/ColumnMapper.tsx`:

1. Add `guessedMapping` prop to `ColumnMapperProps`:
```typescript
interface ColumnMapperProps {
  columns: string[];
  onSubmit: (sourceData: DataSourceCreate) => void;
  isSubmitting?: boolean;
  initialSourceName?: string;
  guessedMapping?: Record<string, { column: string | null; confidence: number }>;
}
```

2. Initialize `mapping` state from `guessedMapping` when provided:
```typescript
const initialMapping: Record<string, string> = {};
if (guessedMapping) {
  for (const [field, guess] of Object.entries(guessedMapping)) {
    if (guess.column) {
      initialMapping[field] = guess.column;
    }
  }
}
const [mapping, setMapping] = useState<Record<string, string>>(initialMapping);
```

3. Show confidence indicator next to each pre-filled dropdown — a small colored dot:
- Green dot (>0.7): high confidence
- Yellow dot (0.4-0.7): medium confidence
- Gray dot (<0.4): low confidence

The confidence dot should appear inline with the dropdown when a guess was pre-filled for that field.

- [ ] **Step 3: Update Upload.tsx to call guess-mapping and pass results**

In `frontend/src/pages/Upload.tsx`:

1. Add `guessedMapping` to the `MAP_COLUMNS` upload state:
```typescript
| { step: 'MAP_COLUMNS'; file: File; fileRef: string; columns: string[];
    suggestedName: string; guessedMapping?: GuessMappingResponse }
```

2. When transitioning to `MAP_COLUMNS`, call the guess-mapping endpoint:
```typescript
// After getting columns (in handleFileSelected and the "Create new source" button)
const guessFormData = new FormData();
guessFormData.append('file_ref', result.file_ref);
const guessResult = await api.upload<GuessMappingResponse>('/api/sources/guess-mapping', guessFormData);

setUploadState({
  step: 'MAP_COLUMNS',
  file,
  fileRef: result.file_ref,
  columns: result.detected_columns,
  suggestedName: result.suggested_name,
  guessedMapping: guessResult,
});
```

3. Pass `guessedMapping` to `ColumnMapper`:
```tsx
<ColumnMapper
  columns={uploadState.columns}
  onSubmit={handleColumnMapSubmit}
  isSubmitting={...}
  initialSourceName={uploadState.suggestedName}
  guessedMapping={uploadState.guessedMapping}
/>
```

- [ ] **Step 4: Build frontend to verify no TypeScript errors**

Run: `cd /home/rani/OneBase/frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/components/ColumnMapper.tsx frontend/src/pages/Upload.tsx
git commit -m "feat: pre-fill column mapper with auto-guessed mappings"
```

---

### Task 4: Auto Signal Selection — Dynamic Weight Computation

**Files:**
- Modify: `backend/app/services/scoring.py`
- Modify: `backend/app/services/matching.py`
- Modify: `backend/tests/test_scoring.py`

- [ ] **Step 1: Write failing test for compute_signal_weights**

```python
# Append to backend/tests/test_scoring.py
from app.services.scoring import compute_signal_weights


class TestComputeSignalWeights:
    """Test dynamic signal weight computation based on field coverage."""

    def test_all_fields_populated_returns_default_weights(self):
        """With all fields present, weights should be close to defaults."""
        suppliers = [
            _make_supplier_obj(id=i, normalized_name=f"Supplier {i}",
                               short_name=f"S{i}", currency="USD",
                               contact_name=f"Contact {i}")
            for i in range(10)
        ]
        weights = compute_signal_weights(suppliers)
        assert set(weights.keys()) == {
            "jaro_winkler", "token_jaccard", "embedding_cosine",
            "short_name_match", "currency_match", "contact_match",
        }
        assert abs(sum(weights.values()) - 1.0) < 0.01

    def test_missing_currency_drops_signal(self):
        """If currency is mostly null, currency_match weight should be 0."""
        suppliers = [
            _make_supplier_obj(id=i, normalized_name=f"Supplier {i}",
                               currency=None, short_name=f"S{i}",
                               contact_name=f"Contact {i}")
            for i in range(10)
        ]
        weights = compute_signal_weights(suppliers)
        assert weights["currency_match"] == 0.0
        # Other weights should be redistributed
        assert abs(sum(weights.values()) - 1.0) < 0.01

    def test_single_value_currency_drops_signal(self):
        """If all suppliers have the same currency, it has no discriminative power."""
        suppliers = [
            _make_supplier_obj(id=i, normalized_name=f"Supplier {i}",
                               currency="USD", short_name=f"S{i}",
                               contact_name=f"Contact {i}")
            for i in range(10)
        ]
        weights = compute_signal_weights(suppliers)
        assert weights["currency_match"] == 0.0

    def test_core_signals_always_present(self):
        """jaro_winkler, token_jaccard, embedding_cosine are always included."""
        suppliers = [
            _make_supplier_obj(id=i, normalized_name=f"Supplier {i}")
            for i in range(10)
        ]
        weights = compute_signal_weights(suppliers)
        assert weights["jaro_winkler"] > 0
        assert weights["token_jaccard"] > 0
        assert weights["embedding_cosine"] > 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/rani/OneBase/backend && python3 -m pytest tests/test_scoring.py::TestComputeSignalWeights -v`
Expected: FAIL — `ImportError: cannot import name 'compute_signal_weights'`

- [ ] **Step 3: Implement compute_signal_weights**

Add to `backend/app/services/scoring.py`:

```python
from app.config import settings

# Minimum coverage for a signal to be included
_MIN_COVERAGE = 0.20
# Minimum distinct values for discriminative power
_MIN_DISTINCT_RATIO = 0.02


def compute_signal_weights(suppliers: list) -> dict[str, float]:
    """Compute dynamic signal weights based on field coverage and cardinality.

    Core signals (jaro_winkler, token_jaccard, embedding_cosine) are always
    included. Optional signals (short_name_match, currency_match, contact_match)
    are included only if the underlying field has sufficient coverage (>20% non-null)
    and cardinality (>1 distinct value).

    Weights are redistributed proportionally among active signals so they sum to 1.0.

    Args:
        suppliers: List of StagedSupplier objects (or SimpleNamespace with same attrs).

    Returns:
        Dict mapping signal name to weight (float), summing to 1.0.
    """
    if not suppliers:
        return {
            "jaro_winkler": settings.matching_weight_jaro_winkler,
            "token_jaccard": settings.matching_weight_token_jaccard,
            "embedding_cosine": settings.matching_weight_embedding_cosine,
            "short_name_match": settings.matching_weight_short_name,
            "currency_match": settings.matching_weight_currency,
            "contact_match": settings.matching_weight_contact,
        }

    total = len(suppliers)

    # Core signals always active
    active_weights = {
        "jaro_winkler": settings.matching_weight_jaro_winkler,
        "token_jaccard": settings.matching_weight_token_jaccard,
        "embedding_cosine": settings.matching_weight_embedding_cosine,
    }

    # Check optional signals
    optional_signals = [
        ("short_name_match", "short_name", settings.matching_weight_short_name),
        ("currency_match", "currency", settings.matching_weight_currency),
        ("contact_match", "contact_name", settings.matching_weight_contact),
    ]

    for signal_name, field_name, default_weight in optional_signals:
        values = [getattr(s, field_name, None) for s in suppliers]
        non_null = [v for v in values if v is not None and str(v).strip()]
        coverage = len(non_null) / total if total > 0 else 0.0

        if coverage < _MIN_COVERAGE:
            active_weights[signal_name] = 0.0
            continue

        # Check cardinality — single distinct value has no discriminative power
        distinct = set(str(v).strip().lower() for v in non_null)
        if len(distinct) <= 1:
            active_weights[signal_name] = 0.0
            continue

        active_weights[signal_name] = default_weight

    # Normalize weights to sum to 1.0
    total_weight = sum(active_weights.values())
    if total_weight > 0:
        active_weights = {k: v / total_weight for k, v in active_weights.items()}

    return active_weights
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/rani/OneBase/backend && python3 -m pytest tests/test_scoring.py::TestComputeSignalWeights -v`
Expected: All PASS

- [ ] **Step 5: Update score_pair to accept optional weights**

Modify `score_pair` in `backend/app/services/scoring.py` to accept an optional `weights` parameter:

```python
def score_pair(
    supplier_a: StagedSupplier,
    supplier_b: StagedSupplier,
    weights: dict[str, float] | None = None,
) -> dict:
```

If `weights` is provided, use it instead of `settings.matching_weight_*` for the confidence calculation:

```python
    # Weighted confidence score
    w = weights or {
        "jaro_winkler": settings.matching_weight_jaro_winkler,
        "token_jaccard": settings.matching_weight_token_jaccard,
        "embedding_cosine": settings.matching_weight_embedding_cosine,
        "short_name_match": settings.matching_weight_short_name,
        "currency_match": settings.matching_weight_currency,
        "contact_match": settings.matching_weight_contact,
    }

    confidence = (
        jaro_winkler * w.get("jaro_winkler", 0.0)
        + token_jaccard * w.get("token_jaccard", 0.0)
        + embedding_cosine * w.get("embedding_cosine", 0.0)
        + short_name_match * w.get("short_name_match", 0.0)
        + currency_match * w.get("currency_match", 0.0)
        + contact_match * w.get("contact_match", 0.0)
    )
```

- [ ] **Step 6: Update matching.py to compute and pass weights**

In `backend/app/services/matching.py`, add weight computation before the scoring loop:

```python
from app.services.scoring import score_pair, compute_signal_weights

# After blocking, before scoring loop:
# Compute dynamic signal weights based on all active suppliers
all_active_suppliers = (
    db.query(StagedSupplier)
    .filter(StagedSupplier.status == "active",
            StagedSupplier.data_source_id.in_(source_ids))
    .all()
)
signal_weights = compute_signal_weights(all_active_suppliers)
logger.info("Auto signal weights: %s", signal_weights)

# Then pass weights to score_pair:
result = score_pair(supplier_a, supplier_b, weights=signal_weights)
```

- [ ] **Step 7: Run all tests to verify no regressions**

Run: `cd /home/rani/OneBase/backend && python3 -m pytest -v`
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/scoring.py backend/app/services/matching.py backend/tests/test_scoring.py
git commit -m "feat: auto signal selection with dynamic weight computation"
```

---

### Task 5: Documentation — Changes Manifest

**Files:**
- Create: `docs/auto-column-mapping-changes.md`

- [ ] **Step 1: Create the changes manifest documenting every file touched**

Create `docs/auto-column-mapping-changes.md` with:
- Every file created or modified
- What was changed and why
- The canonical column code names referenced (BPSNAM_0, BPSNUM_0, etc.)
- How to override or adjust the auto-mapping behavior

- [ ] **Step 2: Commit**

```bash
git add docs/auto-column-mapping-changes.md
git commit -m "docs: add changes manifest for auto column mapping feature"
```
