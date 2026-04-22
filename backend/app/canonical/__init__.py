"""Canonical field registry — single source of truth for OneBase's supplier schema.

All code that needs to know what canonical fields exist (guesser, API, frontend)
reads from this module instead of duplicating the list. New fields are added here
and propagate automatically to the guesser header index, the `/api/canonical-fields`
endpoint, and the frontend UI.
"""

from app.canonical.fields import (
    CANONICAL_FIELDS,
    CANONICAL_FIELDS_BY_KEY,
    GLOBAL_EXCLUDE_HEADERS,
    CanonicalField,
    build_header_synonym_index,
)

__all__ = [
    "CANONICAL_FIELDS",
    "CANONICAL_FIELDS_BY_KEY",
    "GLOBAL_EXCLUDE_HEADERS",
    "CanonicalField",
    "build_header_synonym_index",
]
