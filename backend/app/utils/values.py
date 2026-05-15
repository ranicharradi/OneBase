"""Value cleaning utilities."""

from typing import Any


def normalize_value(value: Any) -> Any:
    """Strip strings and treat empty strings as None. Non-strings pass through."""
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped if stripped else None
    return value
