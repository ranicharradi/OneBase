"""Tests for column guesser service — data-value-based column classification."""

import pytest
from app.services.column_guesser import guess_column_mapping


class TestCurrencyDetection:
    """Currency columns should be identified by ISO 4217 code patterns."""

    def test_detects_currency_column(self):
        rows = [
            {"CUR_0": "USD", "BPSNAM_0": "Acme Corp", "BPSNUM_0": "V001"},
            {"CUR_0": "EUR", "BPSNAM_0": "Beta Inc", "BPSNUM_0": "V002"},
            {"CUR_0": "GBP", "BPSNAM_0": "Gamma Ltd", "BPSNUM_0": "V003"},
        ]
        result = guess_column_mapping(list(rows[0].keys()), rows)
        assert result["currency"]["column"] == "CUR_0"
        assert result["currency"]["confidence"] > 0.7

    def test_all_same_currency_still_detected(self):
        rows = [
            {"CUR_0": "USD", "BPSNAM_0": "Acme Corp"},
            {"CUR_0": "USD", "BPSNAM_0": "Beta Inc"},
        ]
        result = guess_column_mapping(list(rows[0].keys()), rows)
        assert result["currency"]["column"] == "CUR_0"


class TestSupplierNameDetection:
    """Supplier name should be the longest text column with high uniqueness."""

    def test_detects_name_column(self):
        rows = [
            {"BPSNUM_0": "FE661", "BPSNAM_0": "IPC INTERNATIONAL", "BPSSHO_0": "IPC INTERN", "CUR_0": "USD"},
            {"BPSNUM_0": "FE662", "BPSNAM_0": "GLOBAL SUPPLIES LTD", "BPSSHO_0": "GLOBAL SUP", "CUR_0": "EUR"},
            {"BPSNUM_0": "FE663", "BPSNAM_0": "ACME CORPORATION INC", "BPSSHO_0": "ACME CORP", "CUR_0": "GBP"},
        ]
        result = guess_column_mapping(list(rows[0].keys()), rows)
        assert result["supplier_name"]["column"] == "BPSNAM_0"

    def test_prefers_longer_text(self):
        rows = [
            {"short_col": "AB", "long_col": "Very Long Company Name International"},
            {"short_col": "CD", "long_col": "Another Lengthy Business Enterprise"},
            {"short_col": "EF", "long_col": "Third Extensive Corporation Holdings"},
        ]
        result = guess_column_mapping(list(rows[0].keys()), rows)
        assert result["supplier_name"]["column"] == "long_col"


class TestSupplierCodeDetection:
    """Supplier code should be short, alphanumeric, highly unique."""

    def test_detects_code_column(self):
        rows = [
            {"BPSNUM_0": "FE661", "BPSNAM_0": "IPC INTERNATIONAL", "CUR_0": "USD"},
            {"BPSNUM_0": "FE662", "BPSNAM_0": "GLOBAL SUPPLIES LTD", "CUR_0": "EUR"},
            {"BPSNUM_0": "FE663", "BPSNAM_0": "ACME CORPORATION INC", "CUR_0": "GBP"},
        ]
        result = guess_column_mapping(list(rows[0].keys()), rows)
        assert result["supplier_code"]["column"] == "BPSNUM_0"


class TestShortNameDetection:
    """Short name should be shorter text than supplier name."""

    def test_detects_short_name(self):
        rows = [
            {"BPSNUM_0": "FE661", "BPSNAM_0": "IPC INTERNATIONAL", "BPSSHO_0": "IPC INTERN", "CUR_0": "USD"},
            {"BPSNUM_0": "FE662", "BPSNAM_0": "GLOBAL SUPPLIES LTD", "BPSSHO_0": "GLOBAL SUP", "CUR_0": "EUR"},
            {"BPSNUM_0": "FE663", "BPSNAM_0": "ACME CORPORATION INC", "BPSSHO_0": "ACME CORP", "CUR_0": "GBP"},
        ]
        result = guess_column_mapping(list(rows[0].keys()), rows)
        assert result["short_name"]["column"] == "BPSSHO_0"


class TestContactNameDetection:
    """Contact name should detect person-name patterns."""

    def test_detects_contact_name(self):
        rows = [
            {"BPSNAM_0": "Acme Corp", "BPSNUM_0": "V001", "CNTNAM_0": "John Smith"},
            {"BPSNAM_0": "Beta Inc", "BPSNUM_0": "V002", "CNTNAM_0": "Jane Doe"},
            {"BPSNAM_0": "Gamma Ltd", "BPSNUM_0": "V003", "CNTNAM_0": "Bob Wilson"},
        ]
        result = guess_column_mapping(list(rows[0].keys()), rows)
        assert result["contact_name"]["column"] == "CNTNAM_0"


class TestSupplierTypeDetection:
    """Supplier type should be very low cardinality, short categorical."""

    def test_detects_type_column(self):
        rows = [
            {"BPSNAM_0": "Acme Corp", "BPSNUM_0": "V001", "BPSTYP_0": "1", "CUR_0": "USD"},
            {"BPSNAM_0": "Beta Inc", "BPSNUM_0": "V002", "BPSTYP_0": "2", "CUR_0": "EUR"},
            {"BPSNAM_0": "Gamma Ltd", "BPSNUM_0": "V003", "BPSTYP_0": "1", "CUR_0": "GBP"},
            {"BPSNAM_0": "Delta Co", "BPSNUM_0": "V004", "BPSTYP_0": "1", "CUR_0": "USD"},
            {"BPSNAM_0": "Epsilon SA", "BPSNUM_0": "V005", "BPSTYP_0": "2", "CUR_0": "CHF"},
        ]
        result = guess_column_mapping(list(rows[0].keys()), rows)
        assert result["supplier_type"]["column"] == "BPSTYP_0"


class TestFullSageX3Mapping:
    """Test with realistic Sage X3 ERP data."""

    def test_sage_x3_core_fields_detected(self):
        rows = [
            {"BPSNUM_0": "FE661", "BPSNAM_0": "IPC INTERNATIONAL", "BPSSHO_0": "IPC INTERN",
             "BPSTYP_0": "1", "CUR_0": "USD", "PTE_0": "PAIEMAVANCE", "CNTNAM_0": "Pierre Martin"},
            {"BPSNUM_0": "FE662", "BPSNAM_0": "GLOBAL SUPPLIES LTD", "BPSSHO_0": "GLOBAL SUP",
             "BPSTYP_0": "2", "CUR_0": "EUR", "PTE_0": "NET30", "CNTNAM_0": "John Smith"},
            {"BPSNUM_0": "FE663", "BPSNAM_0": "ACME CORPORATION INC", "BPSSHO_0": "ACME CORP",
             "BPSTYP_0": "1", "CUR_0": "GBP", "PTE_0": "NET30", "CNTNAM_0": "Jane Doe"},
            {"BPSNUM_0": "FE664", "BPSNAM_0": "TECHNO SOLUTIONS SARL", "BPSSHO_0": "TECHNO SOL",
             "BPSTYP_0": "1", "CUR_0": "EUR", "PTE_0": "PAIEMAVANCE", "CNTNAM_0": "Marie Dupont"},
            {"BPSNUM_0": "FE665", "BPSNAM_0": "NORDIC ENTERPRISES AB", "BPSSHO_0": "NORDIC ENT",
             "BPSTYP_0": "2", "CUR_0": "SEK", "PTE_0": "NET60", "CNTNAM_0": "Erik Johansson"},
        ]
        columns = list(rows[0].keys())
        result = guess_column_mapping(columns, rows)

        assert result["supplier_name"]["column"] == "BPSNAM_0"
        assert result["supplier_code"]["column"] == "BPSNUM_0"
        assert result["currency"]["column"] == "CUR_0"
        assert result["supplier_name"]["confidence"] > 0.3
        assert result["supplier_code"]["confidence"] > 0.3
        assert result["currency"]["confidence"] > 0.7


class TestEdgeCases:
    """Edge cases and error handling."""

    def test_empty_rows(self):
        result = guess_column_mapping(["A", "B"], [])
        assert result["supplier_name"]["column"] is None
        assert result["supplier_code"]["column"] is None

    def test_empty_columns(self):
        result = guess_column_mapping([], [{"A": "1"}])
        assert result["supplier_name"]["column"] is None

    def test_single_column(self):
        rows = [
            {"VENDOR": "Acme Corp"},
            {"VENDOR": "Beta Inc"},
            {"VENDOR": "Gamma Ltd"},
        ]
        result = guess_column_mapping(["VENDOR"], rows)
        assigned_count = sum(1 for f in result.values() if f["column"] is not None)
        assert assigned_count == 1

    def test_no_column_reuse(self):
        rows = [
            {"A": "FE661", "B": "IPC INTERNATIONAL", "C": "USD", "D": "IPC"},
            {"A": "FE662", "B": "GLOBAL SUPPLIES LTD", "C": "EUR", "D": "GLOBAL"},
            {"A": "FE663", "B": "ACME CORPORATION INC", "C": "GBP", "D": "ACME"},
        ]
        result = guess_column_mapping(["A", "B", "C", "D"], rows)
        assigned_cols = [f["column"] for f in result.values() if f["column"] is not None]
        assert len(assigned_cols) == len(set(assigned_cols)), "Columns were reused across fields"
