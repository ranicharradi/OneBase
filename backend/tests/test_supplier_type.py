"""Tests verifying the Supplier RecordType matches the prior canonical schema."""

from app.record_types import get
from app.record_types.base import Role


def test_supplier_type_is_registered():
    assert get("supplier").label == "Supplier"


def test_supplier_field_keys():
    rt = get("supplier")
    assert rt.field_keys == (
        "supplier_name",
        "supplier_code",
        "short_name",
        "currency",
        "payment_terms",
        "contact_name",
        "supplier_type",
    )


def test_supplier_name_field_is_supplier_name():
    rt = get("supplier")
    assert rt.name_field.key == "supplier_name"
    assert rt.name_field.role == Role.NAME
    assert rt.name_field.required is True


def test_supplier_required_fields():
    rt = get("supplier")
    required = {f.key for f in rt.fields if f.required}
    assert required == {"supplier_name", "supplier_code"}


def test_supplier_signal_weights_sum_to_one():
    rt = get("supplier")
    assert sum(s.weight for s in rt.signals) == 1.0


def test_supplier_signal_set_matches_legacy_six():
    """Confirms the type's signal set covers the same six matchers in scoring.py."""
    rt = get("supplier")
    pairs = {(s.kind, s.field) for s in rt.signals}
    expected = {
        ("jaro_winkler", "supplier_name"),
        ("token_jaccard", "supplier_name"),
        ("embedding_cosine", "supplier_name"),
        ("jaro_winkler", "short_name"),
        ("exact_ci", "currency"),
        ("jaro_winkler", "contact_name"),
    }
    assert pairs == expected
