"""CSV parsing utility with BOM handling and encoding fallback."""
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

    # Try UTF-8 (with BOM stripping) first, fallback to Windows-1252
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


def detect_columns(file_content: bytes, delimiter: str = ";") -> list[str]:
    """Extract column headers from the first row of a CSV file.

    Used by the column mapper UI to show available CSV headers.
    """
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
