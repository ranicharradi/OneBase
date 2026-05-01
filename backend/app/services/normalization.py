"""Name normalization service for supplier name matching."""

import re
import unicodedata

# Domain-specific stopwords — common location/region tokens that appear in many
# supplier names but carry no discriminative value for matching.
# Compared against uppercased, accent-stripped tokens.
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


def normalize_name(name: str | None) -> str:
    """Normalize a supplier name for matching.

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

    # Remove legal suffixes
    result = LEGAL_PATTERN.sub("", result)

    # Remove domain stopwords (token-level, preserves substrings like TUNISAIR)
    result = " ".join(t for t in result.split() if t not in DOMAIN_STOPWORDS)

    # Collapse multiple spaces and strip
    result = re.sub(r"\s+", " ", result).strip()

    return result
