"""Tabular file parsing utilities — dispatches CSV and XLSX inputs to the right reader.

CSV path keeps the existing semantics:
- UTF-8 with BOM (utf-8-sig) preferred, Windows-1252 fallback.
- Default delimiter ";" (overridable per data source).
- All values are strings, trimmed of surrounding whitespace.
"""

import csv
import io
from typing import Any


def parse_csv(file_content: bytes, delimiter: str = ";") -> list[dict[str, Any]]:
    """Parse CSV bytes into list of dicts with trimmed values.

    Handles:
    - UTF-8 with BOM (utf-8-sig)
    - Falls back to Windows-1252 on UnicodeDecodeError
    - Semicolon delimiter by default
    - Whitespace trimming on all values
    - Quoted fields with internal delimiters
    """
    if not file_content:
        return []

    try:
        text = file_content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = file_content.decode("cp1252")

    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter, quotechar='"')
    rows: list[dict[str, Any]] = []
    for row in reader:
        trimmed = {k.strip(): v.strip() if v else v for k, v in row.items()}
        rows.append(trimmed)
    return rows


def detect_columns_csv(file_content: bytes, delimiter: str = ";") -> list[str]:
    """Extract column headers from the first row of a CSV file."""
    if not file_content:
        return []

    try:
        text = file_content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = file_content.decode("cp1252")

    reader = csv.reader(io.StringIO(text), delimiter=delimiter, quotechar='"')
    try:
        headers = next(reader)
        return [h.strip() for h in headers]
    except StopIteration:
        return []
