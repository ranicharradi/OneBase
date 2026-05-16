"""Tests for the CLIENT record type registration and shape."""

from app.record_types import get as get_record_type
from app.record_types.base import Role


def test_client_type_registered():
    rt = get_record_type("client")
    assert rt.label == "Client"


def test_client_name_role_is_name():
    rt = get_record_type("client")
    assert rt.name_field.key == "customer_name"


def test_client_field_keys_present():
    rt = get_record_type("client")
    keys = {f.key for f in rt.fields}
    assert keys == {
        "customer_name",
        "short_name",
        "customer_group",
        "vat_category",
        "currency",
        "customer_type",
    }


def test_client_signal_weights_sum_to_one():
    rt = get_record_type("client")
    total = sum(s.weight for s in rt.signals)
    assert abs(total - 1.0) < 1e-9, f"weights sum to {total}, expected 1.0"


def test_client_signal_fields_resolve():
    rt = get_record_type("client")
    field_keys = {f.key for f in rt.fields}
    for sig in rt.signals:
        assert sig.field in field_keys


def test_client_embedding_cosine_on_name_field():
    rt = get_record_type("client")
    emb_sigs = [s for s in rt.signals if s.kind == "embedding_cosine"]
    assert len(emb_sigs) == 1
    assert emb_sigs[0].field == "customer_name"


def test_client_role_assignments():
    rt = get_record_type("client")
    by_key = {f.key: f for f in rt.fields}
    assert by_key["customer_name"].role == Role.NAME
    assert by_key["currency"].role == Role.ENUM
    assert by_key["vat_category"].role == Role.ENUM
    assert by_key["customer_group"].role == Role.ENUM
    assert by_key["customer_type"].role == Role.ENUM


def test_client_no_identifier_normalize():
    """Client export carries no IBAN/BIC-like fields, so no normalize=identifier."""
    rt = get_record_type("client")
    assert all(f.normalize is None for f in rt.fields)
