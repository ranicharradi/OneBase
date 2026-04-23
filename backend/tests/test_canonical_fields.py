"""Tests for the canonical field registry."""

from app.canonical import (
    CANONICAL_FIELDS,
    CANONICAL_FIELDS_BY_KEY,
    GLOBAL_EXCLUDE_HEADERS,
    build_header_synonym_index,
)


class TestRegistryShape:
    def test_has_exactly_seven_fields(self):
        assert len(CANONICAL_FIELDS) == 7

    def test_keys_are_the_expected_seven(self):
        expected = {
            "supplier_name",
            "supplier_code",
            "short_name",
            "currency",
            "payment_terms",
            "contact_name",
            "supplier_type",
        }
        assert {f.key for f in CANONICAL_FIELDS} == expected

    def test_by_key_index_matches_tuple(self):
        assert set(CANONICAL_FIELDS_BY_KEY) == {f.key for f in CANONICAL_FIELDS}
        for f in CANONICAL_FIELDS:
            assert CANONICAL_FIELDS_BY_KEY[f.key] is f

    def test_supplier_name_and_code_are_required(self):
        required = {f.key for f in CANONICAL_FIELDS if f.required}
        assert required == {"supplier_name", "supplier_code"}

    def test_every_field_has_positive_max_length(self):
        for f in CANONICAL_FIELDS:
            assert f.max_length > 0, f"{f.key} has non-positive max_length"

    def test_field_is_frozen_dataclass(self):
        import dataclasses

        f = CANONICAL_FIELDS[0]
        try:
            f.label = "mutated"  # type: ignore[misc]
        except dataclasses.FrozenInstanceError:
            return
        raise AssertionError("CanonicalField should be frozen")


class TestHeaderSynonyms:
    def test_synonym_index_reproduces_legacy_header_exact(self):
        """The synonym index must contain exactly the same pairs as the
        legacy _HEADER_EXACT dict — preserving current guesser behavior."""
        expected = {
            "supplier_name": "supplier_name",
            "supplier name": "supplier_name",
            "vendor_name": "supplier_name",
            "vendor name": "supplier_name",
            "company_name": "supplier_name",
            "company name": "supplier_name",
            "name": "supplier_name",
            "supplier_code": "supplier_code",
            "supplier code": "supplier_code",
            "vendor_code": "supplier_code",
            "vendor code": "supplier_code",
            "code": "supplier_code",
            "short_name": "short_name",
            "short name": "short_name",
            "abbreviation": "short_name",
            "abbrev": "short_name",
            "alias": "short_name",
            "currency": "currency",
            "currency_code": "currency",
            "currency code": "currency",
            "cur": "currency",
            "payment_terms": "payment_terms",
            "payment terms": "payment_terms",
            "pay_terms": "payment_terms",
            "terms": "payment_terms",
            "contact_name": "contact_name",
            "contact name": "contact_name",
            "contact_person": "contact_name",
            "contact person": "contact_name",
            "contact": "contact_name",
            "supplier_type": "supplier_type",
            "supplier type": "supplier_type",
            "vendor_type": "supplier_type",
            "vendor type": "supplier_type",
            "type": "supplier_type",
            "category": "supplier_type",
        }
        assert build_header_synonym_index() == expected

    def test_no_synonym_collisions_across_fields(self):
        seen: dict[str, str] = {}
        for f in CANONICAL_FIELDS:
            for syn in f.synonyms:
                assert syn not in seen or seen[syn] == f.key, (
                    f"Synonym {syn!r} used by both {seen[syn]!r} and {f.key!r}"
                )
                seen[syn] = f.key

    def test_synonyms_are_lowercased_and_stripped(self):
        for f in CANONICAL_FIELDS:
            for syn in f.synonyms:
                assert syn == syn.lower().strip(), f"Synonym {syn!r} on {f.key} not normalized"


class TestExcludeHeaders:
    def test_exclude_headers_reproduces_legacy_header_exclude(self):
        expected = frozenset(
            {
                "email",
                "e-mail",
                "contact_email",
                "contact email",
                "phone",
                "telephone",
                "tel",
                "fax",
                "mobile",
                "address",
                "street",
                "city",
                "state",
                "province",
                "zip",
                "zip_code",
                "postal_code",
                "postal code",
                "country",
                "country_code",
                "country code",
                "region",
                "website",
                "url",
                "tax_id",
                "tax id",
                "vat",
                "vat_number",
                "duns",
                "created_at",
                "updated_at",
                "modified_at",
                "date",
                "id",
                "notes",
                "description",
                "comments",
            }
        )
        assert expected == GLOBAL_EXCLUDE_HEADERS

    def test_no_synonym_is_also_excluded(self):
        synonyms = set(build_header_synonym_index())
        overlap = synonyms & GLOBAL_EXCLUDE_HEADERS
        assert not overlap, f"These headers are both a synonym and excluded: {overlap}"


class TestSchemaConsistency:
    """Phase 1 keeps the Pydantic ColumnMapping schema statically typed.
    This test enforces that the registry and the schema do not drift."""

    def test_registry_keys_match_column_mapping_fields(self):
        from app.schemas.source import ColumnMapping

        registry_keys = {f.key for f in CANONICAL_FIELDS}
        schema_keys = set(ColumnMapping.model_fields.keys())
        assert registry_keys == schema_keys, (
            f"Drift: in registry but not schema: {registry_keys - schema_keys}; "
            f"in schema but not registry: {schema_keys - registry_keys}"
        )
