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

    def test_remove_tunisie_stopword(self, test_db):
        """Removes 'Tunisie' domain stopword from name."""
        assert normalize_name("Société Tunisie") == "SOCIETE"

    def test_remove_tunisia_variant(self, test_db):
        """Removes 'Tunisia' variant stopword."""
        assert normalize_name("Company Tunisia") == "COMPANY"

    def test_remove_tunisienne_stopword(self, test_db):
        """Removes 'Tunisienne' stopword."""
        assert normalize_name("Banque Tunisienne de Commerce") == "BANQUE DE COMMERCE"

    def test_stopword_only_name(self, test_db):
        """Name consisting only of stopwords returns empty string."""
        assert normalize_name("Tunisie") == ""

    def test_stopword_preserves_non_stopwords(self, test_db):
        """Substrings like TUNISAIR are NOT stripped (token-level match only)."""
        assert normalize_name("Tunisair") == "TUNISAIR"

    def test_stopword_combined_with_legal_suffix(self, test_db):
        """Both legal suffix and domain stopword are stripped."""
        assert normalize_name("Société Tunisie SARL") == "SOCIETE"

    def test_remove_ste_suffix(self, test_db):
        """Removes STE (Société) French legal-form prefix when used as a token."""
        assert normalize_name("STE Industrie") == "INDUSTRIE"

    def test_remove_ets_suffix(self, test_db):
        """Removes ETS (Établissements) French legal form."""
        assert normalize_name("ETS Bouaicha") == "BOUAICHA"

    def test_remove_soc_suffix(self, test_db):
        """Removes SOC abbreviation."""
        assert normalize_name("SOC Tunisienne de Commerce") == "DE COMMERCE"

    def test_remove_cie_suffix(self, test_db):
        """Removes CIE abbreviation."""
        assert normalize_name("Nestlé CIE") == "NESTLE"

    def test_remove_french_article_le(self, test_db):
        """Strips the French article 'LE' as a token."""
        assert normalize_name("Le Comptoir Tunisien") == "COMPTOIR"

    def test_remove_french_article_la(self, test_db):
        """Strips the French article 'LA' as a token."""
        assert normalize_name("La Poste") == "POSTE"

    def test_remove_french_article_les(self, test_db):
        """Strips the French article 'LES' as a token."""
        assert normalize_name("Les Halles Centrales") == "HALLES CENTRALES"

    def test_remove_arabic_article_el(self, test_db):
        """Strips the Maghreb article 'EL' as a token (e.g., EL AMEN PALETTE)."""
        assert normalize_name("EL AMEN PALETTE") == "AMEN PALETTE"

    def test_french_article_preserves_substring(self, test_db):
        """Articles are only stripped at token boundary — LELOUCH stays intact."""
        assert normalize_name("Lelouch") == "LELOUCH"

    def test_el_preserves_substring(self, test_db):
        """EL only stripped as standalone token — ELSIL stays intact."""
        assert normalize_name("Elsil") == "ELSIL"
