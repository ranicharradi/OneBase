"""Tests for ML training API endpoint."""

import tempfile
from unittest.mock import patch

from app.models.source import DataSource
from app.models.batch import ImportBatch
from app.models.staging import StagedSupplier
from app.models.match import MatchCandidate


def _seed_reviewed(db, count=60, confirm_ratio=0.5):
    """Seed reviewed candidates for training."""
    s1 = DataSource(name="S1", file_format="csv", column_mapping={"supplier_name": "n"})
    s2 = DataSource(name="S2", file_format="csv", column_mapping={"supplier_name": "n"})
    db.add_all([s1, s2])
    db.flush()
    b1 = ImportBatch(data_source_id=s1.id, filename="a.csv", uploaded_by="u", status="completed", row_count=count)
    b2 = ImportBatch(data_source_id=s2.id, filename="b.csv", uploaded_by="u", status="completed", row_count=count)
    db.add_all([b1, b2])
    db.flush()

    num_confirmed = int(count * confirm_ratio)
    for i in range(count):
        name_a = f"CORP {i}" if i < num_confirmed else f"ALPHA {i}"
        name_b = f"CORPORATION {i}" if i < num_confirmed else f"BETA {i}"
        status = "confirmed" if i < num_confirmed else "rejected"

        sa = StagedSupplier(
            import_batch_id=b1.id, data_source_id=s1.id,
            name=name_a, normalized_name=name_a.lower(),
            source_code=f"A{i}", raw_data={}, status="active",
        )
        sb = StagedSupplier(
            import_batch_id=b2.id, data_source_id=s2.id,
            name=name_b, normalized_name=name_b.lower(),
            source_code=f"B{i}", raw_data={}, status="active",
        )
        db.add_all([sa, sb])
        db.flush()

        signals = {
            "jaro_winkler": 0.8 if status == "confirmed" else 0.3,
            "token_jaccard": 0.7 if status == "confirmed" else 0.2,
            "embedding_cosine": 0.85 if status == "confirmed" else 0.4,
            "short_name_match": 1.0 if status == "confirmed" else 0.0,
            "currency_match": 1.0 if status == "confirmed" else 0.5,
            "contact_match": 0.6 if status == "confirmed" else 0.2,
        }
        mc = MatchCandidate(
            supplier_a_id=sa.id, supplier_b_id=sb.id,
            confidence=0.7 if status == "confirmed" else 0.3,
            match_signals=signals, status=status, reviewed_by="reviewer",
        )
        db.add(mc)
    db.flush()


class TestTrainModelEndpoint:
    def test_train_returns_metrics(self, authenticated_client, test_db):
        _seed_reviewed(test_db, count=80, confirm_ratio=0.5)
        test_db.commit()

        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("app.services.ml_training.MODEL_DIR", tmpdir):
                resp = authenticated_client.post("/api/matching/train-model")

        assert resp.status_code == 200
        data = resp.json()

        assert "scorer" in data
        assert "blocker" in data

        scorer = data["scorer"]
        assert scorer["sample_count"] == 80
        assert 0 <= scorer["metrics"]["precision"] <= 1
        assert 0 <= scorer["metrics"]["recall"] <= 1
        assert 0 <= scorer["metrics"]["f1"] <= 1
        assert 0 <= scorer["metrics"]["auc"] <= 1
        assert scorer["feature_importances"] is not None

        blocker = data["blocker"]
        assert blocker["sample_count"] == 80

    def test_train_insufficient_data(self, authenticated_client, test_db):
        _seed_reviewed(test_db, count=20, confirm_ratio=0.5)
        test_db.commit()

        resp = authenticated_client.post("/api/matching/train-model")
        assert resp.status_code == 400
        assert "50" in resp.json()["detail"]

    def test_train_single_class_returns_400(self, authenticated_client, test_db):
        """Training with only confirmed (no rejected) candidates returns 400."""
        _seed_reviewed(test_db, count=60, confirm_ratio=1.0)  # all confirmed
        test_db.commit()

        resp = authenticated_client.post("/api/matching/train-model")
        assert resp.status_code == 400
        assert "both" in resp.json()["detail"].lower()

    def test_train_requires_auth(self, test_client):
        resp = test_client.post("/api/matching/train-model")
        assert resp.status_code == 401
