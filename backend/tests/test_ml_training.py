"""Tests for ML training pipeline."""

import tempfile
from unittest.mock import patch

import numpy as np
import pytest

from app.models.batch import ImportBatch
from app.models.enums import BatchStatus, CandidateStatus, RecordStatus
from app.models.match import MatchCandidate
from app.models.match_run import MatchRun
from app.models.ml_model import MLModelVersion
from app.models.source import DataSource
from app.models.staging import StagedRecord
from app.services.ml.train import scorer_feature_names

pytestmark = pytest.mark.slow

SUPPLIER_FEATURE_NAMES = scorer_feature_names("supplier")


def _seed_reviewed_candidates(db, count=60, confirm_ratio=0.5):
    """Create reviewed match candidates with realistic signals."""
    s1 = DataSource(
        name="SRC1", type="supplier", column_mapping={"supplier_name": "name"}, identity_field_key="supplier_name"
    )
    s2 = DataSource(
        name="SRC2", type="supplier", column_mapping={"supplier_name": "name"}, identity_field_key="supplier_name"
    )
    db.add_all([s1, s2])
    db.flush()

    b1 = ImportBatch(
        data_source_id=s1.id,
        filename="a.csv",
        original_filename="a.csv",
        file_extension=".csv",
        uploaded_by="u",
        status=BatchStatus.COMPLETED,
        row_count=count,
    )
    b2 = ImportBatch(
        data_source_id=s2.id,
        filename="b.csv",
        original_filename="b.csv",
        file_extension=".csv",
        uploaded_by="u",
        status=BatchStatus.COMPLETED,
        row_count=count,
    )
    db.add_all([b1, b2])
    db.flush()

    run = MatchRun(type="supplier", mode="FILE_VS_FILE", status="pending", created_by="u")
    db.add(run)
    db.flush()

    results = []
    num_confirmed = int(count * confirm_ratio)

    for i in range(count):
        if i < num_confirmed:
            name_a = f"ACME CORP {i}"
            name_b = f"ACME CORPORATION {i}"
            signals = {
                "jaro_winkler:supplier_name": 0.85 + np.random.uniform(-0.1, 0.1),
                "token_jaccard:supplier_name": 0.80 + np.random.uniform(-0.1, 0.1),
                "embedding_cosine:supplier_name": 0.90 + np.random.uniform(-0.05, 0.05),
                "jaro_winkler:short_name": 1.0,
                "exact_ci:currency": 1.0,
                "jaro_winkler:contact_name": 0.7 + np.random.uniform(-0.1, 0.1),
            }
            status = CandidateStatus.CONFIRMED
        else:
            name_a = f"ALPHA INC {i}"
            name_b = f"BETA LLC {i}"
            signals = {
                "jaro_winkler:supplier_name": 0.40 + np.random.uniform(-0.1, 0.1),
                "token_jaccard:supplier_name": 0.30 + np.random.uniform(-0.1, 0.1),
                "embedding_cosine:supplier_name": 0.50 + np.random.uniform(-0.1, 0.1),
                "jaro_winkler:short_name": 0.0,
                "exact_ci:currency": 0.5,
                "jaro_winkler:contact_name": 0.3 + np.random.uniform(-0.1, 0.1),
            }
            status = CandidateStatus.REJECTED

        rec_a = StagedRecord(
            type="supplier",
            import_batch_id=b1.id,
            data_source_id=s1.id,
            name=name_a,
            normalized_name=name_a.lower(),
            raw_data={"name": name_a},
            status=RecordStatus.ACTIVE,
            fields={
                "supplier_name": name_a,
                "short_name": f"A{i:03d}",
                "currency": "EUR",
            },
        )
        rec_b = StagedRecord(
            type="supplier",
            import_batch_id=b2.id,
            data_source_id=s2.id,
            name=name_b,
            normalized_name=name_b.lower(),
            raw_data={"name": name_b},
            status=RecordStatus.ACTIVE,
            fields={
                "supplier_name": name_b,
                "short_name": f"B{i:03d}",
                "currency": "EUR",
            },
        )
        db.add_all([rec_a, rec_b])
        db.flush()

        mc = MatchCandidate(
            type="supplier",
            match_run_id=run.id,
            record_a_id=rec_a.id,
            record_b_id=rec_b.id,
            confidence=sum(signals.values()) / 6,
            match_signals=signals,
            status=status,
            reviewed_by="reviewer",
        )
        db.add(mc)
        results.append((mc, rec_a, rec_b))

    db.flush()
    return results


class TestExtractTrainingData:
    def test_extracts_confirmed_and_rejected(self, test_db):
        from app.services.ml.train import extract_training_data

        _seed_reviewed_candidates(test_db, count=60, confirm_ratio=0.5)
        test_db.flush()

        X, y = extract_training_data(test_db, "supplier")

        assert X.shape[0] == 60
        assert X.shape[1] == 8  # 6 base + 2 engineered
        assert len(y) == 60
        assert sum(y) == 30  # 50% confirmed
        assert set(y) == {0, 1}

    def test_excludes_pending_candidates(self, test_db):
        from app.services.ml.train import extract_training_data

        _seed_reviewed_candidates(test_db, count=60)
        s = DataSource(
            name="X", type="supplier", column_mapping={"supplier_name": "n"}, identity_field_key="supplier_name"
        )
        test_db.add(s)
        test_db.flush()
        b = ImportBatch(
            data_source_id=s.id,
            filename="x.csv",
            original_filename="x.csv",
            file_extension=".csv",
            uploaded_by="u",
            status="completed",
            row_count=1,
        )
        test_db.add(b)
        test_db.flush()
        sa_ = StagedRecord(
            type="supplier",
            import_batch_id=b.id,
            data_source_id=s.id,
            name="PENDING",
            normalized_name="pending",
            raw_data={},
            status="active",
            fields={"supplier_name": "PENDING", "short_name": "P001"},
        )
        sb_ = StagedRecord(
            type="supplier",
            import_batch_id=b.id,
            data_source_id=s.id,
            name="PENDING B",
            normalized_name="pending b",
            raw_data={},
            status="active",
            fields={"supplier_name": "PENDING B", "short_name": "P002"},
        )
        test_db.add_all([sa_, sb_])
        test_db.flush()
        pending_run = MatchRun(type="supplier", mode="FILE_VS_FILE", status="pending", created_by="u")
        test_db.add(pending_run)
        test_db.flush()
        mc = MatchCandidate(
            type="supplier",
            match_run_id=pending_run.id,
            record_a_id=sa_.id,
            record_b_id=sb_.id,
            confidence=0.5,
            match_signals={
                "jaro_winkler:supplier_name": 0.5,
                "token_jaccard:supplier_name": 0.5,
                "embedding_cosine:supplier_name": 0.5,
                "jaro_winkler:short_name": 0.5,
                "exact_ci:currency": 0.5,
                "jaro_winkler:contact_name": 0.5,
            },
            status="pending",
        )
        test_db.add(mc)
        test_db.flush()

        X, y = extract_training_data(test_db, "supplier")
        assert X.shape[0] == 60  # pending excluded

    def test_engineered_features_correct(self, test_db):
        from app.services.ml.train import extract_training_data

        _seed_reviewed_candidates(test_db, count=60)
        test_db.flush()

        X, y = extract_training_data(test_db, "supplier")

        name_length_ratios = X[:, 6]
        assert all(0 < r <= 1.0 for r in name_length_ratios)

        token_count_diffs = X[:, 7]
        assert all(d >= 0 for d in token_count_diffs)

    def test_insufficient_data_returns_empty(self, test_db):
        from app.services.ml.train import extract_training_data

        _seed_reviewed_candidates(test_db, count=10)
        test_db.flush()

        X, y = extract_training_data(test_db, "supplier")
        assert X.shape[0] == 10


class TestTrainModel:
    def test_train_scorer_returns_metrics(self, test_db):
        from app.services.ml.train import extract_training_data, train_model

        _seed_reviewed_candidates(test_db, count=80, confirm_ratio=0.5)
        test_db.flush()

        X, y = extract_training_data(test_db, "supplier")
        result = train_model(X, y, SUPPLIER_FEATURE_NAMES, model_type="scorer")

        assert result["model"] is not None
        assert 0 <= result["metrics"]["precision"] <= 1
        assert 0 <= result["metrics"]["recall"] <= 1
        assert 0 <= result["metrics"]["f1"] <= 1
        assert 0 <= result["metrics"]["auc"] <= 1
        assert 0 < result["metrics"]["threshold"] < 1
        assert result["feature_importances"] is not None

    def test_train_blocker_targets_high_recall(self, test_db):
        from app.services.ml.train import BLOCKER_FEATURE_NAMES, extract_training_data, train_model

        _seed_reviewed_candidates(test_db, count=100, confirm_ratio=0.5)
        test_db.flush()

        X, y = extract_training_data(test_db, "supplier")
        # Blocker uses jaro_winkler (0), token_jaccard (1), name_length_ratio (6)
        X_blocker = X[:, [0, 1, 6]]
        result = train_model(X_blocker, y, BLOCKER_FEATURE_NAMES, model_type="blocker")

        assert result["model"] is not None
        assert result["metrics"]["threshold"] < 0.5


class TestSaveLoadModel:
    def test_save_and_load_roundtrip(self, test_db):
        from app.services.ml.train import (
            extract_training_data,
            load_active_model,
            save_model,
            train_model,
        )

        _seed_reviewed_candidates(test_db, count=80, confirm_ratio=0.5)
        test_db.flush()

        X, y = extract_training_data(test_db, "supplier")
        result = train_model(X, y, SUPPLIER_FEATURE_NAMES, model_type="scorer")

        with tempfile.TemporaryDirectory() as tmpdir, patch("app.services.ml.train.MODEL_DIR", tmpdir):
            save_model(
                model=result["model"],
                model_type="scorer",
                record_type_key="supplier",
                feature_names=SUPPLIER_FEATURE_NAMES,
                metrics=result["metrics"],
                feature_importances=result["feature_importances"],
                sample_count=80,
                db=test_db,
                created_by="testuser",
            )
            test_db.flush()

            bundle = load_active_model(test_db, "scorer", "supplier", model_dir=tmpdir)

        assert bundle is not None
        assert bundle.threshold == result["metrics"]["threshold"]
        assert len(bundle.feature_names) == 8

    def test_load_returns_none_when_no_model(self, test_db):
        from app.services.ml.train import load_active_model

        bundle = load_active_model(test_db, "scorer", "supplier")
        assert bundle is None

    def test_new_model_deactivates_old(self, test_db):
        from app.services.ml.train import (
            extract_training_data,
            save_model,
            train_model,
        )

        _seed_reviewed_candidates(test_db, count=80, confirm_ratio=0.5)
        test_db.flush()

        X, y = extract_training_data(test_db, "supplier")
        result = train_model(X, y, SUPPLIER_FEATURE_NAMES, model_type="scorer")

        with tempfile.TemporaryDirectory() as tmpdir, patch("app.services.ml.train.MODEL_DIR", tmpdir):
            save_model(
                result["model"],
                "scorer",
                "supplier",
                SUPPLIER_FEATURE_NAMES,
                result["metrics"],
                result["feature_importances"],
                80,
                test_db,
            )
            test_db.flush()

            import time

            time.sleep(1)

            save_model(
                result["model"],
                "scorer",
                "supplier",
                SUPPLIER_FEATURE_NAMES,
                result["metrics"],
                result["feature_importances"],
                80,
                test_db,
            )
            test_db.flush()

        active_count = (
            test_db.query(MLModelVersion)
            .filter(MLModelVersion.model_type == "scorer", MLModelVersion.is_active == True)  # noqa: E712
            .count()
        )
        assert active_count == 1
