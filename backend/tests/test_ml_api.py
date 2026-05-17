"""Tests for ML training API endpoint."""

import tempfile
from unittest.mock import patch

import pytest

from app.models.batch import ImportBatch
from app.models.enums import BatchStatus, CandidateStatus, RecordStatus
from app.models.match import MatchCandidate
from app.models.match_run import MatchRun
from app.models.source import DataSource
from app.models.staging import StagedRecord

pytestmark = pytest.mark.slow


def _seed_reviewed(db, count=60, confirm_ratio=0.5):
    """Seed reviewed candidates for training."""
    s1 = DataSource(name="S1", type="supplier", file_format="csv", column_mapping={"supplier_name": "n"})
    s2 = DataSource(name="S2", type="supplier", file_format="csv", column_mapping={"supplier_name": "n"})
    db.add_all([s1, s2])
    db.flush()
    b1 = ImportBatch(
        data_source_id=s1.id, filename="a.csv", uploaded_by="u", status=BatchStatus.COMPLETED, row_count=count
    )
    b2 = ImportBatch(
        data_source_id=s2.id, filename="b.csv", uploaded_by="u", status=BatchStatus.COMPLETED, row_count=count
    )
    db.add_all([b1, b2])
    db.flush()

    run = MatchRun(type="supplier", mode="FILE_VS_FILE", status="pending", created_by="u")
    db.add(run)
    db.flush()

    num_confirmed = int(count * confirm_ratio)
    for i in range(count):
        name_a = f"CORP {i}" if i < num_confirmed else f"ALPHA {i}"
        name_b = f"CORPORATION {i}" if i < num_confirmed else f"BETA {i}"
        status = CandidateStatus.CONFIRMED if i < num_confirmed else CandidateStatus.REJECTED

        sa = StagedRecord(
            type="supplier",
            import_batch_id=b1.id,
            data_source_id=s1.id,
            name=name_a,
            normalized_name=name_a.lower(),
            raw_data={},
            status=RecordStatus.ACTIVE,
            fields={"supplier_name": name_a, "short_name": f"A{i}"},
        )
        sb = StagedRecord(
            type="supplier",
            import_batch_id=b2.id,
            data_source_id=s2.id,
            name=name_b,
            normalized_name=name_b.lower(),
            raw_data={},
            status=RecordStatus.ACTIVE,
            fields={"supplier_name": name_b, "short_name": f"B{i}"},
        )
        db.add_all([sa, sb])
        db.flush()

        signals = {
            "jaro_winkler:supplier_name": 0.8 if status == CandidateStatus.CONFIRMED else 0.3,
            "token_jaccard:supplier_name": 0.7 if status == CandidateStatus.CONFIRMED else 0.2,
            "embedding_cosine:supplier_name": 0.85 if status == CandidateStatus.CONFIRMED else 0.4,
            "jaro_winkler:short_name": 1.0 if status == CandidateStatus.CONFIRMED else 0.0,
            "exact_ci:currency": 1.0 if status == CandidateStatus.CONFIRMED else 0.5,
            "jaro_winkler:contact_name": 0.6 if status == CandidateStatus.CONFIRMED else 0.2,
        }
        mc = MatchCandidate(
            type="supplier",
            match_run_id=run.id,
            record_a_id=sa.id,
            record_b_id=sb.id,
            confidence=0.7 if status == CandidateStatus.CONFIRMED else 0.3,
            match_signals=signals,
            status=status,
            reviewed_by="reviewer",
        )
        db.add(mc)
    db.flush()


class TestTrainModelEndpoint:
    def test_train_returns_metrics(self, authenticated_client, test_db):
        _seed_reviewed(test_db, count=80, confirm_ratio=0.5)
        test_db.commit()

        with tempfile.TemporaryDirectory() as tmpdir, patch("app.services.ml.train.MODEL_DIR", tmpdir):
            resp = authenticated_client.post("/api/matching/train-model", params={"type": "supplier"})

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

        resp = authenticated_client.post("/api/matching/train-model", params={"type": "supplier"})
        assert resp.status_code == 400
        assert "50" in resp.json()["detail"]

    def test_train_single_class_returns_400(self, authenticated_client, test_db):
        """Training with only confirmed (no rejected) candidates returns 400."""
        _seed_reviewed(test_db, count=60, confirm_ratio=1.0)  # all confirmed
        test_db.commit()

        resp = authenticated_client.post("/api/matching/train-model", params={"type": "supplier"})
        assert resp.status_code == 400
        assert "both" in resp.json()["detail"].lower()

    def test_train_requires_auth(self, test_client):
        resp = test_client.post("/api/matching/train-model", params={"type": "supplier"})
        assert resp.status_code == 401


class TestActiveLearningSort:
    def _seed_queue(self, db):
        s1 = DataSource(name="Q1", type="supplier", file_format="csv", column_mapping={"supplier_name": "n"})
        s2 = DataSource(name="Q2", type="supplier", file_format="csv", column_mapping={"supplier_name": "n"})
        db.add_all([s1, s2])
        db.flush()
        b1 = ImportBatch(data_source_id=s1.id, filename="a.csv", uploaded_by="u", status="completed", row_count=3)
        b2 = ImportBatch(data_source_id=s2.id, filename="b.csv", uploaded_by="u", status="completed", row_count=3)
        db.add_all([b1, b2])
        db.flush()

        run = MatchRun(type="supplier", mode="FILE_VS_FILE", status="pending", created_by="u")
        db.add(run)
        db.flush()

        pairs = []
        for i, conf in enumerate([0.9, 0.5, 0.3]):
            sa = StagedRecord(
                type="supplier",
                import_batch_id=b1.id,
                data_source_id=s1.id,
                name=f"SUP A{i}",
                normalized_name=f"sup a{i}",
                raw_data={},
                status="active",
                fields={"supplier_name": f"SUP A{i}", "short_name": f"QA{i}"},
            )
            sb = StagedRecord(
                type="supplier",
                import_batch_id=b2.id,
                data_source_id=s2.id,
                name=f"SUP B{i}",
                normalized_name=f"sup b{i}",
                raw_data={},
                status="active",
                fields={"supplier_name": f"SUP B{i}", "short_name": f"QB{i}"},
            )
            db.add_all([sa, sb])
            db.flush()
            mc = MatchCandidate(
                type="supplier",
                match_run_id=run.id,
                record_a_id=sa.id,
                record_b_id=sb.id,
                confidence=conf,
                match_signals={
                    "jaro_winkler:supplier_name": conf,
                    "token_jaccard:supplier_name": conf,
                    "embedding_cosine:supplier_name": conf,
                    "jaro_winkler:short_name": 0,
                    "exact_ci:currency": 0,
                    "jaro_winkler:contact_name": 0,
                },
                status="pending",
            )
            db.add(mc)
            pairs.append(mc)
        db.flush()
        return pairs

    def test_default_sort_confidence_desc(self, authenticated_client, test_db):
        self._seed_queue(test_db)
        test_db.commit()

        resp = authenticated_client.get("/api/review/queue")
        items = resp.json()["items"]
        confs = [item["confidence"] for item in items]
        assert confs == sorted(confs, reverse=True)

    def test_sort_confidence_asc(self, authenticated_client, test_db):
        self._seed_queue(test_db)
        test_db.commit()

        resp = authenticated_client.get("/api/review/queue?sort=confidence_asc")
        items = resp.json()["items"]
        confs = [item["confidence"] for item in items]
        assert confs == sorted(confs)

    def test_sort_active_learning(self, authenticated_client, test_db):
        self._seed_queue(test_db)
        test_db.commit()

        resp = authenticated_client.get("/api/review/queue?sort=active_learning")
        items = resp.json()["items"]
        confs = [item["confidence"] for item in items]

        # Most uncertain (closest to 0.5) should be first
        uncertainties = [abs(c - 0.5) for c in confs]
        assert uncertainties == sorted(uncertainties)
        # 0.5 is most uncertain, then 0.3 (distance 0.2), then 0.9 (distance 0.4)
        assert confs[0] == 0.5

    def test_sort_invalid_value_returns_422(self, authenticated_client, test_db):
        resp = authenticated_client.get("/api/review/queue?sort=invalid")
        assert resp.status_code == 422
