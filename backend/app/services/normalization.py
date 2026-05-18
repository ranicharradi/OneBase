"""Name normalization service for record-name matching."""

import re
import unicodedata

# Domain-specific stopwords — common location/region tokens that appear in many
# organization names but carry no discriminative value for matching.
# Compared against uppercased, accent-stripped tokens.
# DOMAIN_STOPWORDS and LEGAL_SUFFIXES below are organization-shaped heuristics that
# happen to also work for many other entity types. When future RecordTypes need
# different normalization, this module can grow per-type variants.
DOMAIN_STOPWORDS = {
    "TUNISIE",
    "TUNISIA",
    "TUNISIEN",
    "TUNISIENNE",
    # French articles — token-level, so substrings (LELOUCH, LASER) are preserved
    "LE",
    "LA",
    "LES",
    "EL",
}

# Standalone currency tokens — common noise in financial-entity names (banks,
# multi-currency vendor variants). Token-level, so substrings (USDA, TNDM, etc.)
# survive untouched.
CURRENCY_STOPWORDS = {
    "TND",
    "EUR",
    "EURO",
    "USD",
    "DINARS",
}

# Legal suffixes sorted by length (longest first) to match longest first
LEGAL_SUFFIXES = [
    "GMBH & CO KG",
    "GMBH & CO",
    "CORPORATION",
    "INCORPORATED",
    "LIMITED",
    "SARL",
    "SASU",
    "EURL",
    "CORP",
    "GMBH",
    "ETS",
    "PLC",
    "LLC",
    "LTD",
    "INC",
    "SAS",
    "SCI",
    "SNC",
    "STE",
    "SOC",
    "CIE",
    "ETT",
    "PTY",
    "OHG",
    "BV",
    "NV",
    "AG",
    "EI",
    "KG",
    "SA",
]

# Build regex pattern matching any legal suffix at word boundary (end of string)
_suffix_pattern = "|".join(re.escape(s) for s in LEGAL_SUFFIXES)
LEGAL_PATTERN = re.compile(rf"\b({_suffix_pattern})\b", re.IGNORECASE)


def _strip_accents(text: str) -> str:
    """Remove accents from characters (É → E)."""
    # NFD decomposes accented chars into base + combining marks
    nfkd = unicodedata.normalize("NFD", text)
    # Strip combining characters (category 'M' = Mark)
    stripped = "".join(c for c in nfkd if unicodedata.category(c) != "Mn")
    # Re-normalize to NFC
    return unicodedata.normalize("NFC", stripped)


def loose_name(name: str | None) -> str:
    """Conservative normalization: uppercase + accent-strip + legal-suffix-strip only.

    Unlike normalize_name, does NOT strip domain/currency stopwords.
    Used by intra-source grouping to catch "TTEI" + "TTEI SARL" without
    over-collapsing currency variants like "TTEI USD" vs "TTEI".
    """
    if not name:
        return ""
    result = name.strip()
    if not result:
        return ""
    result = result.upper()
    result = _strip_accents(result)
    # Legal-suffix strip BEFORE punctuation→space so multi-word suffixes like
    # "GMBH & CO KG" still match (the regex relies on the literal '&').
    result = LEGAL_PATTERN.sub("", result)
    result = PUNCTUATION_PATTERN.sub(" ", result)
    result = re.sub(r"\s+", " ", result).strip()
    return result


# Punctuation tokens that should be treated as word separators (so "HP-AUTOMATISME"
# tokenizes as ["HP", "AUTOMATISME"] for both blocking and Jaro-Winkler).
PUNCTUATION_PATTERN = re.compile(r"[-_./&'\\,]")


# Placeholder strings that ERP exports use for "no value" / "to delete" / "miscellaneous".
# Records whose normalized name matches one of these (or is too short to be discriminative)
# are skipped from blocking — they would otherwise pollute fuzzy buckets and produce
# noise candidates. Stored in their post-normalize_name form (uppercase, no punct).
_PLACEHOLDER_TOKENS: frozenset[str] = frozenset(
    {
        "SUP",
        "SUPP",
        "DIVERS",
        "A SUPPRIMER",
        "TO DELETE",
        "DELETE",
        "TBD",
        "X+",
        "XX",
        "XXX",
        "NA",
        "N A",
        "NONE",
        "NULL",
        "TODO",
        "UNKNOWN",
    }
)


def is_placeholder_name(value: str | None) -> bool:
    """True for empty / single-char / pure-digit / known-placeholder names."""
    if not value:
        return True
    v = value.strip().upper()
    if len(v) <= 1:
        return True
    if v.isdigit():
        return True
    return v in _PLACEHOLDER_TOKENS


def normalize_name(name: str | None) -> str:
    """Normalize a record name for matching.

    Steps:
    1. Strip whitespace
    2. Uppercase
    3. Strip accents (NFD → remove combining chars → NFC)
    4. Remove legal suffixes (SARL, SAS, GmbH, LLC, etc.)
    5. Collapse multiple spaces
    6. Strip again

    Returns empty string for None or empty input.
    """
    if not name:
        return ""

    result = name.strip()
    if not result:
        return ""

    # Uppercase
    result = result.upper()

    # Strip accents
    result = _strip_accents(result)

    # Legal-suffix strip BEFORE punctuation→space so multi-word suffixes like
    # "GMBH & CO KG" still match the regex (which contains the literal '&').
    result = LEGAL_PATTERN.sub("", result)

    # Punctuation → space so "HP-AUTOMATISME" tokenizes the same as "HP AUTOMATISME"
    result = PUNCTUATION_PATTERN.sub(" ", result)

    # Remove domain stopwords (token-level, preserves substrings like TUNISAIR)
    stopwords = DOMAIN_STOPWORDS | CURRENCY_STOPWORDS
    result = " ".join(t for t in result.split() if t not in stopwords)

    # Collapse multiple spaces and strip
    result = re.sub(r"\s+", " ", result).strip()

    return result
