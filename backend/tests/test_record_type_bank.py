"""Tests for the BANK record type registration and shape."""

import pytest

from app.record_types import get as get_record_type
from app.record_types.base import Role


@pytest.fixture(autouse=True)
def _ensure_bank_registered():
    """Ensure BANK type is registered (in case a parallel test cleared registry)."""
    from app.record_types import bank as _bank  # noqa: F401

    yield


def test_bank_type_registered():
    rt = get_record_type("bank")
    assert rt.label == "Bank"


def test_bank_name_role_is_name():
    rt = get_record_type("bank")
    assert rt.name_field.key == "bank_name"


def test_bank_identifier_fields_normalize():
    rt = get_record_type("bank")
    by_key = {f.key: f for f in rt.fields}
    assert by_key["bic"].normalize == "identifier"
    assert by_key["iban"].normalize == "identifier"
    assert by_key["bank_name"].normalize is None


def test_bank_field_keys_present():
    """phone and website are dropped (always empty in the export)."""
    rt = get_record_type("bank")
    keys = {f.key for f in rt.fields}
    assert keys == {
        "bank_name",
        "short_name",
        "bic",
        "iban",
        "city",
        "country",
    }


def test_bank_signal_weights_sum_to_one():
    rt = get_record_type("bank")
    total = sum(s.weight for s in rt.signals)
    assert abs(total - 1.0) < 1e-9, f"weights sum to {total}, expected 1.0"


def test_bank_signal_kinds():
    """Bank uses iban_prefix_ci (not exact_ci) on iban; full-IBAN exact match dropped."""
    rt = get_record_type("bank")
    kinds_by_field = {(s.kind, s.field) for s in rt.signals}
    assert ("iban_prefix_ci", "iban") in kinds_by_field
    assert ("exact_ci", "iban") not in kinds_by_field
    assert ("exact_ci", "bic") in kinds_by_field


def test_bank_signal_fields_resolve():
    rt = get_record_type("bank")
    field_keys = {f.key for f in rt.fields}
    for sig in rt.signals:
        assert sig.field in field_keys, f"signal {sig.kind} references unknown field {sig.field!r}"


def test_bank_embedding_cosine_on_name_field():
    rt = get_record_type("bank")
    emb_sigs = [s for s in rt.signals if s.kind == "embedding_cosine"]
    assert len(emb_sigs) == 1
    assert emb_sigs[0].field == "bank_name"


def test_bank_name_field_marked_required():
    rt = get_record_type("bank")
    assert rt.name_field.required is True


def test_bank_role_assignments():
    rt = get_record_type("bank")
    by_key = {f.key: f for f in rt.fields}
    assert by_key["bank_name"].role == Role.NAME
    assert by_key["bic"].role == Role.CODE
    assert by_key["iban"].role == Role.CODE
    assert by_key["country"].role == Role.ENUM


def test_bank_uses_contributing_weight_scoring():
    rt = get_record_type("bank")
    assert rt.scoring == "contributing_weight"


def test_bank_confidence_threshold():
    rt = get_record_type("bank")
    assert rt.confidence_threshold == 0.75


def test_bank_bic_weight_is_dominant_when_present():
    """BIC weight (0.30) is the largest single weight — encodes 'dominate when present'."""
    rt = get_record_type("bank")
    bic_sig = next(s for s in rt.signals if s.field == "bic")
    other_weights = [s.weight for s in rt.signals if s.field != "bic"]
    assert bic_sig.weight > max(other_weights)
