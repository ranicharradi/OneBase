"""Single source of truth for accepted upload file formats.

Used by the upload router, the detect-headers helper, and the tabular parser
so the allow-list is declared exactly once. The frontend mirrors this list in
src/utils/fileFormat.ts — keep them in sync.
"""

from __future__ import annotations

ALLOWED_UPLOAD_EXTENSIONS: frozenset[str] = frozenset({".csv", ".xlsx"})


def extension_of(filename: str) -> str:
    """Return the lower-cased extension including the dot, or '' if absent."""
    prefix, dot, ext = filename.rpartition(".")
    if not dot or not ext or not prefix:
        return ""
    return f".{ext.lower()}"


def is_allowed_upload(filename: str) -> bool:
    return extension_of(filename) in ALLOWED_UPLOAD_EXTENSIONS
