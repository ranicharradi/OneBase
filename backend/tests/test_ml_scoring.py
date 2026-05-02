"""Tests for ML scoring and blocker inference."""

from unittest.mock import MagicMock

import lightgbm as lgb
import numpy as np
import pytest

from app.models.batch import ImportBatch
from app.models.enums import BatchStatus, SupplierStatus
from app.models.source import DataSource
from app.models.staging import StagedSupplier
from app.services.ml_training import ModelBundle

pytestmark = pytest.mark.slow


def _make_supplier(db, source, batch, name, **kwargs):
    defaults = dict(
        import_batch_id=batch.id,
        data_source_id=source.id,
        name=name,
        normalized_name=name.lower(),
        source_code="C001",
        short_name="TST",
        currency="EUR",
        raw_data={"name": name},
        status=SupplierStatus.ACTIVE,
    )
    defaults.update(kwargs)
    s = StagedSupplier(**defaults)
    db.add(s)
    db.flush()
    return s


def _seed_pair(db):
    s = DataSource(name="S", file_format="csv", column_mapping={"supplier_name": "n"})
    db.add(s)
    db.flush()
    b = ImportBatch(data_source_id=s.id, filename="x.csv", uploaded_by="u", status=BatchStatus.COMPLETED, row_count=2)
    db.add(b)
    db.flush()
    sup_a = _make_supplier(db, s, b, "ACME CORP")
    sup_b = _make_supplier(db, s, b, "ACME CORPORATION", source_code="C002")
    return sup_a, sup_b


def _make_mock_bundle(feature_count=8, predict_value=0.85):
    mock_model = MagicMock(spec=lgb.Booster)
    mock_model.predict.return_value = np.array([predict_value])

    if feature_count == 8:
        names = [
            "jaro_winkler",
            "token_jaccard",
            "embedding_cosine",
            "short_name_match",
            "currency_match",
            "contact_match",
            "name_length_ratio",
            "token_count_diff",
        ]
    else:
        names = ["jaro_winkler", "token_jaccard", "name_length_ratio"]

    return ModelBundle(model=mock_model, threshold=0.5, feature_names=names)


class TestMlScorePair:
    def test_returns_confidence_and_signals(self, test_db):
        from app.services.ml_scoring import ml_score_pair

        sup_a, sup_b = _seed_pair(test_db)
        bundle = _make_mock_bundle(predict_value=0.85)

        result = ml_score_pair(sup_a, sup_b, bundle)

        assert 0 <= result["confidence"] <= 1
        assert result["confidence"] == 0.85
        assert "signals" in result
        assert set(result["signals"].keys()) == {
            "jaro_winkler",
            "token_jaccard",
            "embedding_cosine",
            "short_name_match",
            "currency_match",
        }

    def test_model_receives_8_features(self, test_db):
        from app.services.ml_scoring import ml_score_pair

        sup_a, sup_b = _seed_pair(test_db)
        bundle = _make_mock_bundle()

        ml_score_pair(sup_a, sup_b, bundle)

        call_args = bundle.model.predict.call_args
        features = call_args[0][0]
        assert features.shape == (1, 8)


class TestBlockerFilter:
    def test_filters_low_confidence_pairs(self, test_db):
        from app.services.ml_scoring import blocker_filter

        s = DataSource(name="S", file_format="csv", column_mapping={"supplier_name": "n"})
        test_db.add(s)
        test_db.flush()
        b = ImportBatch(data_source_id=s.id, filename="x.csv", uploaded_by="u", status="completed", row_count=4)
        test_db.add(b)
        test_db.flush()

        sup1 = _make_supplier(test_db, s, b, "ALPHA INC", source_code="A1")
        sup2 = _make_supplier(test_db, s, b, "ALPHA INCORPORATED", source_code="A2")
        sup3 = _make_supplier(test_db, s, b, "BETA LLC", source_code="B1")
        sup4 = _make_supplier(test_db, s, b, "GAMMA CORP", source_code="G1")

        pairs = [(sup1.id, sup2.id), (sup3.id, sup4.id)]
        supplier_lookup = {s.id: s for s in [sup1, sup2, sup3, sup4]}

        mock_model = MagicMock(spec=lgb.Booster)
        mock_model.predict.return_value = np.array([0.8, 0.1])

        bundle = ModelBundle(
            model=mock_model,
            threshold=0.3,
            feature_names=["jaro_winkler", "token_jaccard", "name_length_ratio"],
        )

        filtered = blocker_filter(pairs, supplier_lookup, bundle)
        assert len(filtered) == 1
        assert filtered[0] == (sup1.id, sup2.id)

    def test_no_bundle_passes_all(self):
        from app.services.ml_scoring import blocker_filter

        pairs = [(1, 2), (3, 4)]
        filtered = blocker_filter(pairs, {}, None)
        assert filtered == pairs


class TestEngineeredFeatures:
    def test_name_length_ratio(self):
        from app.services.ml_training import _compute_engineered_features

        nlr, tcd = _compute_engineered_features("ACME", "ACME CORP")
        assert 0 < nlr <= 1.0
        assert nlr == len("ACME") / len("ACME CORP")

    def test_token_count_diff(self):
        from app.services.ml_training import _compute_engineered_features

        nlr, tcd = _compute_engineered_features("ACME CORP INC", "ACME")
        assert tcd == 2
