"""Tests for RecordType.scoring and RecordType.confidence_threshold."""

import pytest

from app.record_types.base import FieldDef, RecordType, Role, Signal


def _minimal(scoring="total_weight", confidence_threshold=None):
    return RecordType(
        key="t",
        label="T",
        fields=(FieldDef(key="n", label="N", role=Role.NAME, required=True),),
        signals=(Signal(kind="jaro_winkler", field="n", weight=1.0),),
        scoring=scoring,
        confidence_threshold=confidence_threshold,
    )


def test_scoring_default_is_total_weight():
    rt = RecordType(
        key="t",
        label="T",
        fields=(FieldDef(key="n", label="N", role=Role.NAME, required=True),),
        signals=(Signal(kind="jaro_winkler", field="n", weight=1.0),),
    )
    assert rt.scoring == "total_weight"
    assert rt.confidence_threshold is None


def test_scoring_accepts_contributing_weight():
    rt = _minimal(scoring="contributing_weight")
    assert rt.scoring == "contributing_weight"


def test_scoring_rejects_unknown_value():
    with pytest.raises(ValueError, match="scoring"):
        _minimal(scoring="weighted_geometric_mean")


def test_confidence_threshold_accepts_valid_float():
    rt = _minimal(confidence_threshold=0.75)
    assert rt.confidence_threshold == 0.75


def test_confidence_threshold_accepts_one():
    rt = _minimal(confidence_threshold=1.0)
    assert rt.confidence_threshold == 1.0


def test_confidence_threshold_rejects_zero():
    with pytest.raises(ValueError, match="confidence_threshold"):
        _minimal(confidence_threshold=0.0)


def test_confidence_threshold_rejects_greater_than_one():
    with pytest.raises(ValueError, match="confidence_threshold"):
        _minimal(confidence_threshold=1.5)


def test_confidence_threshold_rejects_negative():
    with pytest.raises(ValueError, match="confidence_threshold"):
        _minimal(confidence_threshold=-0.1)
