"""Tests for ML scoring and blocker inference."""

from unittest.mock import MagicMock

import lightgbm as lgb
import numpy as np
import pytest

from app.models.batch import ImportBatch
from app.models.enums import BatchStatus, RecordStatus
from app.models.source import DataSource
from app.models.staging import StagedRecord
from app.services.ml.train import ModelBundle
from app.services.record_set import RecordRef

pytestmark = pytest.mark.slow


def _make_record(db, source, batch, name, **kwargs):
    defaults = dict(
        type="supplier",
        import_batch_id=batch.id,
        data_source_id=source.id,
        name=name,
        normalized_name=name.lower(),
        raw_data={"name": name},
        status=RecordStatus.ACTIVE,
        fields={
            "supplier_name": name,
            "short_name": "C001",
            "currency": "EUR",
        },
    )
    defaults.update(kwargs)
    s = StagedRecord(**defaults)
    db.add(s)
    db.flush()
    return s


def _seed_pair(db):
    s = DataSource(name="S", type="supplier", file_format="csv", column_mapping={"supplier_name": "n"})
    db.add(s)
    db.flush()
    b = ImportBatch(data_source_id=s.id, filename="x.csv", uploaded_by="u", status=BatchStatus.COMPLETED, row_count=2)
    db.add(b)
    db.flush()
    rec_a = _make_record(db, s, b, "ACME CORP")
    rec_b = _make_record(
        db,
        s,
        b,
        "ACME CORPORATION",
        fields={
            "supplier_name": "ACME CORPORATION",
            "short_name": "C002",
            "currency": "EUR",
        },
    )
    return rec_a, rec_b


def _make_mock_bundle(feature_count=8, predict_value=0.85):
    mock_model = MagicMock(spec=lgb.Booster)
    mock_model.predict.return_value = np.array([predict_value])

    if feature_count == 8:
        names = [
            "jaro_winkler:supplier_name",
            "token_jaccard:supplier_name",
            "embedding_cosine:supplier_name",
            "jaro_winkler:short_name",
            "exact_ci:currency",
            "jaro_winkler:contact_name",
            "name_length_ratio",
            "token_count_diff",
        ]
    else:
        names = ["jaro_winkler", "token_jaccard", "name_length_ratio"]

    return ModelBundle(model=mock_model, threshold=0.5, feature_names=names, record_type="supplier")


class TestMlScorePair:
    def test_returns_confidence_and_signals(self, test_db):
        from app.services.ml.score import ml_score_pair

        rec_a, rec_b = _seed_pair(test_db)
        bundle = _make_mock_bundle(predict_value=0.85)

        result = ml_score_pair(rec_a, rec_b, bundle)

        assert 0 <= result["confidence"] <= 1
        assert result["confidence"] == 0.85
        assert "signals" in result
        # Signals are in "kind:field" format; check at least the main keys are present.
        assert "jaro_winkler:supplier_name" in result["signals"]
        assert "token_jaccard:supplier_name" in result["signals"]
        assert "embedding_cosine:supplier_name" in result["signals"]

    def test_model_receives_8_features(self, test_db):
        from app.services.ml.score import ml_score_pair

        rec_a, rec_b = _seed_pair(test_db)
        bundle = _make_mock_bundle()

        ml_score_pair(rec_a, rec_b, bundle)

        call_args = bundle.model.predict.call_args
        features = call_args[0][0]
        assert features.shape == (1, 8)


class TestBlockerFilter:
    def test_filters_low_confidence_pairs(self, test_db):
        from app.services.ml.score import blocker_filter

        s = DataSource(name="S", type="supplier", file_format="csv", column_mapping={"supplier_name": "n"})
        test_db.add(s)
        test_db.flush()
        b = ImportBatch(data_source_id=s.id, filename="x.csv", uploaded_by="u", status="completed", row_count=4)
        test_db.add(b)
        test_db.flush()

        rec1 = _make_record(
            test_db,
            s,
            b,
            "ALPHA INC",
            fields={"supplier_name": "ALPHA INC", "short_name": "A1", "currency": "EUR"},
        )
        rec2 = _make_record(
            test_db,
            s,
            b,
            "ALPHA INCORPORATED",
            fields={
                "supplier_name": "ALPHA INCORPORATED",
                "short_name": "A2",
                "currency": "EUR",
            },
        )
        rec3 = _make_record(
            test_db,
            s,
            b,
            "BETA LLC",
            fields={"supplier_name": "BETA LLC", "short_name": "B1", "currency": "EUR"},
        )
        rec4 = _make_record(
            test_db,
            s,
            b,
            "GAMMA CORP",
            fields={"supplier_name": "GAMMA CORP", "short_name": "G1", "currency": "EUR"},
        )

        ref1 = RecordRef(rec1.id, "staged")
        ref2 = RecordRef(rec2.id, "staged")
        ref3 = RecordRef(rec3.id, "staged")
        ref4 = RecordRef(rec4.id, "staged")
        pairs = [(ref1, ref2), (ref3, ref4)]
        record_lookup = {
            ref1: rec1,
            ref2: rec2,
            ref3: rec3,
            ref4: rec4,
        }

        mock_model = MagicMock(spec=lgb.Booster)
        mock_model.predict.return_value = np.array([0.8, 0.1])

        bundle = ModelBundle(
            model=mock_model,
            threshold=0.3,
            feature_names=["jaro_winkler", "token_jaccard", "name_length_ratio"],
            record_type="supplier",
        )

        filtered = blocker_filter(pairs, record_lookup, bundle)
        assert len(filtered) == 1
        assert filtered[0] == (ref1, ref2)

    def test_no_bundle_passes_all(self):
        from app.services.ml.score import blocker_filter

        ref_a = RecordRef(1, "staged")
        ref_b = RecordRef(2, "staged")
        ref_c = RecordRef(3, "staged")
        ref_d = RecordRef(4, "staged")
        pairs = [(ref_a, ref_b), (ref_c, ref_d)]
        filtered = blocker_filter(pairs, {}, None)
        assert filtered == pairs


class TestEngineeredFeatures:
    def test_name_length_ratio(self):
        from app.services.ml.features import compute_engineered_features

        nlr, tcd = compute_engineered_features("ACME", "ACME CORP")
        assert 0 < nlr <= 1.0
        assert nlr == len("ACME") / len("ACME CORP")

    def test_token_count_diff(self):
        from app.services.ml.features import compute_engineered_features

        nlr, tcd = compute_engineered_features("ACME CORP INC", "ACME")
        assert tcd == 2


def test_ml_score_pair_propagates_none_from_weighted_scorer():
    """When the underlying weighted scorer returns None (NAME guard), ml_score_pair returns None."""
    from types import SimpleNamespace
    from unittest.mock import patch

    from app.services.ml.score import ml_score_pair

    bundle = SimpleNamespace(record_type="supplier", model=None, threshold=0.5)
    rec_a = SimpleNamespace(type="supplier")
    rec_b = SimpleNamespace(type="supplier")

    with patch("app.services.scoring.score_pair", return_value=None):
        result = ml_score_pair(rec_a, rec_b, bundle)
        assert result is None
