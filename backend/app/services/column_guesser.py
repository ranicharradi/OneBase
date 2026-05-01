"""Column guesser service — classifies CSV columns against OneBase's canonical
supplier fields (see `app.canonical`) using data-value heuristics.

Each CSV column is scored against every canonical field using:
- Header-name matching against per-field synonym lists (Pass 0, high confidence)
- A per-field scorer that inspects data values (coverage, cardinality, length,
  character-class mix, company-token hits, ISO currency-code match, etc.)

Assignment uses priority-based passes to avoid ambiguity:
currency first (most distinctive), then name, code, contact, type, terms, short.
"""

import re
import types

from app.canonical import (
    CANONICAL_FIELDS,
    GLOBAL_EXCLUDE_HEADERS,
    build_header_synonym_index,
)

# ISO 4217 currency codes (common subset)
_ISO_CURRENCIES = {
    "AED",
    "AFN",
    "ALL",
    "AMD",
    "ANG",
    "AOA",
    "ARS",
    "AUD",
    "AWG",
    "AZN",
    "BAM",
    "BBD",
    "BDT",
    "BGN",
    "BHD",
    "BIF",
    "BMD",
    "BND",
    "BOB",
    "BRL",
    "BSD",
    "BTN",
    "BWP",
    "BYN",
    "BZD",
    "CAD",
    "CDF",
    "CHF",
    "CLP",
    "CNY",
    "COP",
    "CRC",
    "CUP",
    "CVE",
    "CZK",
    "DJF",
    "DKK",
    "DOP",
    "DZD",
    "EGP",
    "ERN",
    "ETB",
    "EUR",
    "FJD",
    "FKP",
    "GBP",
    "GEL",
    "GHS",
    "GIP",
    "GMD",
    "GNF",
    "GTQ",
    "GYD",
    "HKD",
    "HNL",
    "HRK",
    "HTG",
    "HUF",
    "IDR",
    "ILS",
    "INR",
    "IQD",
    "IRR",
    "ISK",
    "JMD",
    "JOD",
    "JPY",
    "KES",
    "KGS",
    "KHR",
    "KMF",
    "KPW",
    "KRW",
    "KWD",
    "KYD",
    "KZT",
    "LAK",
    "LBP",
    "LKR",
    "LRD",
    "LSL",
    "LYD",
    "MAD",
    "MDL",
    "MGA",
    "MKD",
    "MMK",
    "MNT",
    "MOP",
    "MRU",
    "MUR",
    "MVR",
    "MWK",
    "MXN",
    "MYR",
    "MZN",
    "NAD",
    "NGN",
    "NIO",
    "NOK",
    "NPR",
    "NZD",
    "OMR",
    "PAB",
    "PEN",
    "PGK",
    "PHP",
    "PKR",
    "PLN",
    "PYG",
    "QAR",
    "RON",
    "RSD",
    "RUB",
    "RWF",
    "SAR",
    "SBD",
    "SCR",
    "SDG",
    "SEK",
    "SGD",
    "SHP",
    "SLE",
    "SOS",
    "SRD",
    "SSP",
    "STN",
    "SYP",
    "SZL",
    "THB",
    "TJS",
    "TMT",
    "TND",
    "TOP",
    "TRY",
    "TTD",
    "TWD",
    "TZS",
    "UAH",
    "UGX",
    "USD",
    "UYU",
    "UZS",
    "VES",
    "VND",
    "VUV",
    "WST",
    "XAF",
    "XCD",
    "XOF",
    "XPF",
    "YER",
    "ZAR",
    "ZMW",
    "ZWL",
}

_COMPANY_TOKENS = {
    "inc",
    "corp",
    "corporation",
    "ltd",
    "limited",
    "llc",
    "gmbh",
    "sa",
    "sas",
    "sarl",
    "ag",
    "bv",
    "nv",
    "plc",
    "co",
    "company",
    "group",
    "holdings",
    "international",
    "intl",
    "services",
    "solutions",
    "industries",
    "enterprises",
    "partners",
    "associates",
    "consulting",
    "technologies",
    "tech",
    "systems",
}

# --- Canonical field metadata --------------------------------------------
# All canonical-field knowledge (the field list, header synonyms, and the
# exclude set) lives in `app.canonical` and is the single source of truth.
# This module used to maintain its own copies; now they are derived.

_ALL_FIELDS: list[str] = [f.key for f in CANONICAL_FIELDS]

_EMPTY_RESULT = {field: {"column": None, "confidence": 0.0} for field in _ALL_FIELDS}

_MIN_SCORE = 0.15

# Column name patterns — map header text to canonical fields.
# Keys are matched against the lowercased, stripped column name.
_HEADER_EXACT: types.MappingProxyType[str, str] = types.MappingProxyType(build_header_synonym_index())

# Column names that should NOT be mapped to any canonical field.
# These are common CSV columns that the guesser might mis-classify
# because their data profile superficially matches a canonical field.
_HEADER_EXCLUDE: frozenset[str] = GLOBAL_EXCLUDE_HEADERS


def _non_empty_values(rows: list[dict[str, str]], col: str) -> list[str]:
    """Extract non-empty, non-whitespace values for a column."""
    return [v.strip() for row in rows if (v := row.get(col, "")) and v.strip()]


def _uniqueness_ratio(values: list[str]) -> float:
    if not values:
        return 0.0
    return len(set(values)) / len(values)


def _avg_length(values: list[str]) -> float:
    if not values:
        return 0.0
    return sum(len(v) for v in values) / len(values)


def _coverage(rows: list[dict[str, str]], col: str) -> float:
    if not rows:
        return 0.0
    non_empty = sum(1 for row in rows if row.get(col, "").strip())
    return non_empty / len(rows)


def _score_currency(values: list[str]) -> float:
    """ISO 4217 3-letter codes."""
    if not values:
        return 0.0
    iso_count = sum(1 for v in values if v.upper() in _ISO_CURRENCIES)
    iso_ratio = iso_count / len(values)
    avg_len = _avg_length(values)
    length_ok = 2.5 <= avg_len <= 3.5
    if iso_ratio > 0.8 and length_ok:
        return 0.95
    elif iso_ratio > 0.5:
        return 0.7
    elif iso_ratio > 0.2:
        return 0.3
    return 0.0


_DATETIME_RE = re.compile(r"^\d{4}-\d{2}-\d{2}|^\d{2}/\d{2}/\d{4}|^\d{2}-\d{2}-\d{4}")


def _is_datetime_column(values: list[str]) -> bool:
    if not values:
        return False
    match_count = sum(
        1 for v in values if _DATETIME_RE.search(v) or (len(v) > 10 and any(c.isdigit() for c in v) and ":" in v)
    )
    return match_count / len(values) > 0.5


def _score_supplier_name(values: list[str]) -> float:
    """Long text, company tokens, high uniqueness."""
    if not values:
        return 0.0
    if _is_datetime_column(values):
        return 0.0
    avg_len = _avg_length(values)
    uniqueness = _uniqueness_ratio(values)
    company_count = sum(1 for v in values if set(v.lower().split()) & _COMPANY_TOKENS)
    company_ratio = company_count / len(values)
    # Prefer longer text columns (20+ chars = max score)
    length_score = min(avg_len / 20.0, 1.0)
    # Bonus for ALL CAPS (common for company names in ERP systems)
    upper_count = sum(1 for v in values if v == v.upper() and len(v) > 3)
    upper_ratio = upper_count / len(values)
    return length_score * 0.35 + uniqueness * 0.25 + company_ratio * 0.25 + upper_ratio * 0.15


def _score_supplier_code(values: list[str]) -> float:
    """Short, alphanumeric, very high uniqueness, preferably mixed alpha+digits."""
    if not values:
        return 0.0
    avg_len = _avg_length(values)
    uniqueness = _uniqueness_ratio(values)

    # Short values (ideal: 3-15 chars)
    if avg_len < 2:
        length_score = 0.1  # Single chars/digits are unlikely codes
    elif avg_len <= 15:
        length_score = 1.0
    else:
        length_score = max(0.0, 1.0 - (avg_len - 15) / 30.0)

    # Alphanumeric pattern
    alnum_count = sum(1 for v in values if re.match(r"^[\w\-]+$", v))
    alnum_ratio = alnum_count / len(values)

    # Mixed alpha+digits is a strong signal (e.g., "FE661", "V001")
    # Pure numbers are more likely to be IDs/ticks, pure alpha more like names
    mixed_count = sum(1 for v in values if re.search(r"[a-zA-Z]", v) and re.search(r"\d", v))
    mixed_ratio = mixed_count / len(values)

    # Has any numeric component
    has_digit = sum(1 for v in values if re.search(r"\d", v))
    digit_ratio = has_digit / len(values)

    # Very high uniqueness required
    uniqueness_score = 1.0 if uniqueness > 0.95 else uniqueness

    return length_score * 0.15 + uniqueness_score * 0.35 + alnum_ratio * 0.10 + mixed_ratio * 0.25 + digit_ratio * 0.15


def _score_short_name(values: list[str], name_avg_len: float) -> float:
    """Shorter text than supplier name, moderate uniqueness."""
    if not values:
        return 0.0
    avg_len = _avg_length(values)
    if name_avg_len > 0 and avg_len >= name_avg_len:
        return 0.0
    if avg_len < 2:
        length_score = 0.0
    elif avg_len <= 15:
        length_score = 1.0
    else:
        length_score = max(0.0, 1.0 - (avg_len - 15) / 20.0)
    text_count = sum(1 for v in values if re.search(r"[a-zA-Z]", v))
    text_ratio = text_count / len(values)
    uniqueness = _uniqueness_ratio(values)
    return length_score * 0.40 + text_ratio * 0.30 + uniqueness * 0.30


def _score_contact_name(values: list[str]) -> float:
    """Person-name patterns: multi-word, title case (not ALL CAPS)."""
    if not values:
        return 0.0
    if _is_datetime_column(values):
        return 0.0
    # Multi-word strings (2-4 words)
    multi_word_count = sum(1 for v in values if 2 <= len(v.split()) <= 4)
    multi_word_ratio = multi_word_count / len(values)

    # Title Case specifically — person names are Title Case, not ALL CAPS
    # Must contain letters to count (exclude pure digits/symbols)
    title_count = sum(1 for v in values if v == v.title() and re.search(r"[a-zA-Z]", v) and len(v) >= 3)
    title_ratio = title_count / len(values)

    # Moderate length (5-40 chars)
    avg_len = _avg_length(values)
    if avg_len < 3:
        length_score = 0.0
    elif avg_len <= 40:
        length_score = 1.0
    else:
        length_score = 0.3

    # Alpha-heavy (names are mostly letters + spaces)
    alpha_count = sum(1 for v in values if re.match(r"^[a-zA-Z\s.\-]+$", v))
    alpha_ratio = alpha_count / len(values)

    # Penalize ALL CAPS (more likely company names)
    upper_count = sum(1 for v in values if v == v.upper() and len(v) > 3)
    upper_penalty = upper_count / len(values)

    score = multi_word_ratio * 0.30 + title_ratio * 0.30 + alpha_ratio * 0.20 + length_score * 0.20
    # Reduce score for ALL CAPS columns
    return score * (1.0 - upper_penalty * 0.5)


def _score_payment_terms(values: list[str]) -> float:
    """Low cardinality text/codes."""
    if not values:
        return 0.0
    distinct_count = len(set(values))
    avg_len = _avg_length(values)
    if 2 <= distinct_count <= 30:
        cardinality_score = 1.0
    elif distinct_count == 1:
        cardinality_score = 0.3
    else:
        cardinality_score = 0.0
    if avg_len < 2:
        length_score = 0.0
    elif avg_len <= 20:
        length_score = 1.0
    else:
        length_score = max(0.0, 1.0 - (avg_len - 20) / 30.0)
    text_count = sum(1 for v in values if re.search(r"[a-zA-Z]", v))
    text_ratio = text_count / len(values)
    return cardinality_score * 0.50 + length_score * 0.25 + text_ratio * 0.25


def _score_supplier_type(values: list[str]) -> float:
    """Very low cardinality, short categorical."""
    if not values:
        return 0.0
    distinct_count = len(set(values))
    avg_len = _avg_length(values)
    if distinct_count > 15:
        return 0.0
    cardinality_score = 1.0 if distinct_count <= 10 else 0.5
    if avg_len <= 5:
        length_score = 1.0
    elif avg_len <= 10:
        length_score = 0.6
    else:
        length_score = 0.2
    return cardinality_score * 0.60 + length_score * 0.40


def _best_column(
    field_scorer,
    columns: list[str],
    col_values: dict[str, list[str]],
    col_coverage: dict[str, float],
    used: set[str],
    **kwargs,
) -> tuple[str | None, float]:
    """Find the best unassigned column for a given field scorer."""
    best_col = None
    best_score = 0.0
    for col in columns:
        if col in used or col_coverage[col] < 0.3:
            continue
        score = field_scorer(col_values[col], **kwargs) * col_coverage[col]
        if score > best_score:
            best_score = score
            best_col = col
    return best_col, best_score


def guess_column_mapping(
    columns: list[str],
    sample_rows: list[dict[str, str]],
) -> dict[str, dict[str, str | float | None]]:
    """Guess canonical field -> CSV column mapping from data values.

    Uses priority-based passes to avoid ambiguity:
    1. Currency (ISO codes — most distinctive signal)
    2. Supplier name (longest text, company tokens)
    3. Supplier code (short alphanumeric with digits)
    4. Contact name (person-name patterns, title case)
    5. Supplier type (very low cardinality)
    6. Payment terms (medium cardinality codes)
    7. Short name (shorter than name — depends on name assignment)

    Args:
        columns: CSV column headers.
        sample_rows: List of dicts (header -> value) from sample rows.

    Returns:
        Dict mapping each canonical field to:
          {"column": str | None, "confidence": float}
    """
    if not columns or not sample_rows:
        return dict(_EMPTY_RESULT)

    # Pre-compute values per column
    col_values: dict[str, list[str]] = {}
    col_coverage: dict[str, float] = {}
    for col in columns:
        col_values[col] = _non_empty_values(sample_rows, col)
        col_coverage[col] = _coverage(sample_rows, col)

    result: dict[str, dict[str, str | float | None]] = {}
    used: set[str] = set()

    # --- Pass 0: Header-based assignment ---
    # Exact column name matches are high-confidence and override data heuristics.
    # Also mark excluded columns so they can't be mis-assigned by data scoring.
    excluded: set[str] = set()
    for col in columns:
        norm = col.strip().lower()
        if norm in _HEADER_EXCLUDE:
            excluded.add(col)
            continue
        field = _HEADER_EXACT.get(norm)
        if field and field not in result and col not in used:
            result[field] = {"column": col, "confidence": 0.9}
            used.add(col)

    def _assign(field: str, scorer, **kwargs) -> None:
        if field in result:
            return  # already assigned by header matching
        col, score = _best_column(scorer, columns, col_values, col_coverage, used | excluded, **kwargs)
        if col and score >= _MIN_SCORE:
            result[field] = {"column": col, "confidence": round(score, 3)}
            used.add(col)

    # Priority-ordered assignment passes (ignore fields already matched by header)
    # 1. Currency — ISO codes are unambiguous
    _assign("currency", _score_currency)

    # 2. Supplier name — longest text with company tokens
    _assign("supplier_name", _score_supplier_name)

    # 3. Supplier code — short, unique, has digits
    _assign("supplier_code", _score_supplier_code)

    # 4. Short name — depends on name column's avg length (before contact to avoid stealing)
    name_col = result.get("supplier_name", {}).get("column")
    name_avg_len = _avg_length(col_values.get(name_col, [])) if name_col else 0.0
    _assign("short_name", _score_short_name, name_avg_len=name_avg_len)

    # 5. Contact name — person-name patterns
    _assign("contact_name", _score_contact_name)

    # 6. Supplier type — very low cardinality
    _assign("supplier_type", _score_supplier_type)

    # 7. Payment terms — medium cardinality
    _assign("payment_terms", _score_payment_terms)

    # Fill missing fields
    for field in _ALL_FIELDS:
        if field not in result:
            result[field] = {"column": None, "confidence": 0.0}

    return result
