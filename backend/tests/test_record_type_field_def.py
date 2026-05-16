"""Tests for the FieldDef.normalize extension."""

import pytest

from app.record_types.base import FieldDef, RecordType, Role, Signal


def test_field_def_normalize_defaults_to_none():
    fd = FieldDef(key="x", label="X", role=Role.EXTRA)
    assert fd.normalize is None


def test_field_def_accepts_identifier_normalize():
    fd = FieldDef(key="x", label="X", role=Role.CODE, normalize="identifier")
    assert fd.normalize == "identifier"


def test_record_type_rejects_unknown_normalize_value():
    with pytest.raises(ValueError, match="normalize"):
        RecordType(
            key="bad",
            label="Bad",
            fields=(
                FieldDef(key="n", label="N", role=Role.NAME, required=True),
                FieldDef(key="x", label="X", role=Role.CODE, normalize="weird"),
            ),
            signals=(Signal(kind="jaro_winkler", field="n", weight=1.0),),
        )
