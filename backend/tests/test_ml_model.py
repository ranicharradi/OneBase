"""Tests for MLModelVersion ORM model."""

from app.models.ml_model import MLModelVersion


class TestMLModelVersion:
    def test_create_model_version(self, test_db):
        mv = MLModelVersion(
            model_type="scorer",
            filename="ml_models/scorer_20260326.lgbm",
            feature_names=["jaro_winkler", "token_jaccard", "embedding_cosine",
                           "short_name_match", "currency_match", "contact_match",
                           "name_length_ratio", "token_count_diff"],
            metrics={"precision": 0.92, "recall": 0.88, "f1": 0.90, "auc": 0.95, "threshold": 0.45},
            sample_count=150,
            is_active=True,
            created_by="admin",
        )
        test_db.add(mv)
        test_db.flush()

        assert mv.id is not None
        assert mv.model_type == "scorer"
        assert mv.is_active is True
        assert mv.feature_names[0] == "jaro_winkler"
        assert mv.metrics["f1"] == 0.90
        assert mv.created_at is not None

    def test_active_flag_default_false(self, test_db):
        mv = MLModelVersion(
            model_type="blocker",
            filename="ml_models/blocker_20260326.lgbm",
            feature_names=["jaro_winkler", "token_jaccard", "name_length_ratio"],
            metrics={"recall": 0.98, "threshold": 0.12},
            sample_count=150,
        )
        test_db.add(mv)
        test_db.flush()

        assert mv.is_active is False

    def test_query_active_model(self, test_db):
        old = MLModelVersion(
            model_type="scorer",
            filename="ml_models/scorer_old.lgbm",
            feature_names=["jaro_winkler"],
            metrics={"f1": 0.80},
            sample_count=100,
            is_active=False,
        )
        new = MLModelVersion(
            model_type="scorer",
            filename="ml_models/scorer_new.lgbm",
            feature_names=["jaro_winkler"],
            metrics={"f1": 0.90},
            sample_count=200,
            is_active=True,
        )
        test_db.add_all([old, new])
        test_db.flush()

        active = (
            test_db.query(MLModelVersion)
            .filter(MLModelVersion.model_type == "scorer", MLModelVersion.is_active == True)
            .first()
        )
        assert active is not None
        assert active.filename == "ml_models/scorer_new.lgbm"
