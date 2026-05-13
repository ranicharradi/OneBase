"""Tests for dq scoring service."""

import pytest

from app.record_types.base import FieldDef, Role
from app.services.dq import compute_dq


def _fields(*specs):
    """Helper: each spec is (key, role, required=False)."""
    return tuple(FieldDef(key=k, label=k, role=r, required=req) for k, r, req in specs)


def _make_record(fields_payload):
    """Build a minimal UnifiedRecord-like object exposing only .fields."""

    class _R:
        pass

    r = _R()
    r.fields = fields_payload
    return r


def test_compute_dq_all_filled_all_valid():
    fields = _fields(
        ("name", Role.NAME, True),
        ("email", Role.EMAIL, True),
    )
    rec = _make_record({"name": "Acme", "email": "a@b.com"})
    completeness, validity, score = compute_dq(rec, fields)
    assert completeness == 1.0
    assert validity == 1.0
    assert score == 1.0


def test_compute_dq_missing_required_field():
    fields = _fields(
        ("name", Role.NAME, True),
        ("email", Role.EMAIL, True),
    )
    rec = _make_record({"name": "Acme"})  # email missing
    completeness, _, _ = compute_dq(rec, fields)
    assert completeness == 0.5


def test_compute_dq_invalid_email():
    fields = _fields(
        ("email", Role.EMAIL, True),
    )
    rec = _make_record({"email": "not-an-email"})
    _, validity, _ = compute_dq(rec, fields)
    assert validity == 0.0


def test_compute_dq_phone_role():
    fields = _fields(
        ("phone", Role.PHONE, True),
    )
    valid_rec = _make_record({"phone": "+216 22 123 456"})
    invalid_rec = _make_record({"phone": "ABC"})
    assert compute_dq(valid_rec, fields)[1] == 1.0
    assert compute_dq(invalid_rec, fields)[1] == 0.0


def test_compute_dq_name_and_code_non_empty():
    fields = _fields(
        ("name", Role.NAME, True),
        ("code", Role.CODE, True),
    )
    rec = _make_record({"name": "  ", "code": "X1"})  # name only whitespace → invalid
    _, validity, _ = compute_dq(rec, fields)
    assert validity == 0.5


def test_compute_dq_enum_and_extra_always_pass():
    fields = _fields(
        ("currency", Role.ENUM, False),
        ("notes", Role.EXTRA, False),
    )
    rec = _make_record({"currency": "anything", "notes": "anything"})
    _, validity, _ = compute_dq(rec, fields)
    assert validity == 1.0


def test_compute_dq_no_required_fields_falls_back_to_total():
    fields = _fields(
        ("name", Role.NAME, False),
        ("code", Role.CODE, False),
    )
    rec = _make_record({"name": "Acme"})  # 1 of 2 filled
    completeness, _, _ = compute_dq(rec, fields)
    assert completeness == 0.5


def test_compute_dq_score_is_average():
    fields = _fields(
        ("name", Role.NAME, True),
        ("email", Role.EMAIL, True),
    )
    rec = _make_record({"name": "Acme", "email": "bad"})  # completeness=1, validity=0.5
    _, _, score = compute_dq(rec, fields)
    assert score == pytest.approx(0.75)
