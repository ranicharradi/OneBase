"""Tests for name normalization service."""

from app.services.normalization import normalize_name


class TestNormalizeName:
    """Tests for normalize_name function."""

    def test_uppercase_input(self, test_db):
        """Uppercases the input."""
        assert normalize_name("acme industries") == "ACME INDUSTRIES"

    def test_remove_sarl(self, test_db):
        """Removes SARL suffix."""
        assert normalize_name("Société Générale SARL") == "SOCIETE GENERALE"

    def test_remove_sas(self, test_db):
        """Removes SAS suffix."""
        assert normalize_name("Acme SAS") == "ACME"

    def test_remove_gmbh(self, test_db):
        """Removes GmbH suffix."""
        assert normalize_name("Deutsche Bank GmbH") == "DEUTSCHE BANK"

    def test_remove_llc(self, test_db):
        """Removes LLC suffix."""
        assert normalize_name("Acme LLC") == "ACME"

    def test_remove_ltd(self, test_db):
        """Removes Ltd suffix."""
        assert normalize_name("Beta Ltd") == "BETA"

    def test_remove_inc(self, test_db):
        """Removes Inc suffix."""
        assert normalize_name("Gamma Inc") == "GAMMA"

    def test_remove_gmbh_co_kg(self, test_db):
        """Removes GmbH & Co KG suffix."""
        assert normalize_name("Siemens GmbH & Co KG") == "SIEMENS"

    def test_collapse_spaces(self, test_db):
        """Collapses multiple spaces to single space."""
        assert normalize_name("Acme   Global   International") == "ACME GLOBAL INTERNATIONAL"

    def test_empty_input(self, test_db):
        """Returns empty string for empty input."""
        assert normalize_name("") == ""

    def test_none_input(self, test_db):
        """Returns empty string for None input."""
        assert normalize_name(None) == ""

    def test_strip_accents(self, test_db):
        """Strips accented characters (É → E)."""
        assert normalize_name("Énergie Renouvelable") == "ENERGIE RENOUVELABLE"

    def test_remove_plc(self, test_db):
        """Removes PLC suffix."""
        assert normalize_name("Barclays PLC") == "BARCLAYS"

    def test_remove_corporation(self, test_db):
        """Removes CORPORATION suffix."""
        assert normalize_name("Microsoft Corporation") == "MICROSOFT"

    def test_remove_sa(self, test_db):
        """Removes SA suffix (shorter suffixes should work too)."""
        assert normalize_name("Total SA") == "TOTAL"

    def test_whitespace_only(self, test_db):
        """Whitespace-only input returns empty string."""
        assert normalize_name("   ") == ""
