# backend/tests/test_file_format_util.py
import pytest

from app.utils.file_format import (
    ALLOWED_UPLOAD_EXTENSIONS,
    extension_of,
    is_allowed_upload,
)


@pytest.mark.parametrize(
    "filename,expected",
    [
        ("data.csv", ".csv"),
        ("data.CSV", ".csv"),
        ("Book1.xlsx", ".xlsx"),
        ("nodot", ""),
        ("trailing.", ""),
        (".hidden", ""),
    ],
)
def test_extension_of(filename, expected):
    assert extension_of(filename) == expected


@pytest.mark.parametrize(
    "filename,allowed",
    [
        ("good.csv", True),
        ("good.xlsx", True),
        ("good.CSV", True),
        ("evil.tsv", False),
        ("evil.json", False),
        ("noext", False),
    ],
)
def test_is_allowed_upload(filename, allowed):
    assert is_allowed_upload(filename) is allowed


def test_constant_is_a_frozen_set():
    assert frozenset({".csv", ".xlsx"}) == ALLOWED_UPLOAD_EXTENSIONS
