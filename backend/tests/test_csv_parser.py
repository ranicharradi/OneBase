"""Tests for CSV parsing utility."""

from app.utils.csv_parser import detect_columns, parse_csv


class TestParseCsv:
    """Tests for parse_csv function."""

    def test_parse_csv_utf8_bom(self, test_db):
        """CSV with UTF-8 BOM is parsed correctly."""
        content = b"\xef\xbb\xbfcode;name;city\n001;Acme Corp;Paris\n002;Beta Ltd;London\n"
        rows = parse_csv(content)
        assert len(rows) == 2
        assert rows[0]["code"] == "001"
        assert rows[0]["name"] == "Acme Corp"
        assert rows[0]["city"] == "Paris"

    def test_parse_csv_semicolon_delimiter(self, test_db):
        """Default semicolon delimiter is used."""
        content = b"code;name;city\n001;Acme Corp;Paris\n"
        rows = parse_csv(content)
        assert len(rows) == 1
        assert rows[0]["code"] == "001"
        assert rows[0]["name"] == "Acme Corp"

    def test_parse_csv_whitespace_trimming(self, test_db):
        """Leading and trailing whitespace is trimmed from values."""
        content = b"code;name;city\n  001  ;  Acme Corp  ;  Paris  \n"
        rows = parse_csv(content)
        assert rows[0]["code"] == "001"
        assert rows[0]["name"] == "Acme Corp"
        assert rows[0]["city"] == "Paris"

    def test_parse_csv_windows_1252_fallback(self, test_db):
        """Falls back to Windows-1252 encoding when UTF-8 fails."""
        # Windows-1252 encoded content with special chars (é = 0xe9)
        content = b"code;name;city\n001;Caf\xe9 Corp;Paris\n"
        rows = parse_csv(content)
        assert len(rows) == 1
        assert rows[0]["name"] == "Café Corp"

    def test_parse_csv_empty_file(self, test_db):
        """Empty file returns empty list."""
        content = b""
        rows = parse_csv(content)
        assert rows == []

    def test_parse_csv_quoted_values_with_semicolons(self, test_db):
        """Quoted values containing semicolons are preserved."""
        content = b'code;name;address\n001;"Acme; Corp";"123; Main St"\n'
        rows = parse_csv(content)
        assert len(rows) == 1
        assert rows[0]["name"] == "Acme; Corp"
        assert rows[0]["address"] == "123; Main St"


class TestDetectColumns:
    """Tests for detect_columns function."""

    def test_detect_columns_returns_headers(self, test_db):
        """Returns list of column headers from CSV."""
        content = b"code;name;city;country\n001;Acme;Paris;France\n"
        columns = detect_columns(content)
        assert columns == ["code", "name", "city", "country"]

    def test_detect_columns_with_bom(self, test_db):
        """Handles BOM in header row."""
        content = b"\xef\xbb\xbfcode;name;city\n001;Acme;Paris\n"
        columns = detect_columns(content)
        assert columns == ["code", "name", "city"]

    def test_detect_columns_trims_whitespace(self, test_db):
        """Trims whitespace from header names."""
        content = b"  code  ;  name  ;  city  \n001;Acme;Paris\n"
        columns = detect_columns(content)
        assert columns == ["code", "name", "city"]

    def test_detect_columns_empty_file(self, test_db):
        """Empty file returns empty list."""
        content = b""
        columns = detect_columns(content)
        assert columns == []
