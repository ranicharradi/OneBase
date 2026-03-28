"""Tests for retraining service and matching API endpoints."""

from sqlalchemy.orm import Session

from app.models.batch import ImportBatch
from app.models.enums import BatchStatus, SupplierStatus
from app.models.match import MatchCandidate, MatchGroup
from app.models.source import DataSource
from app.models.staging import StagedSupplier


def _make_source(db: Session, name: str) -> DataSource:
    src = DataSource(
        name=name,
        file_format="csv",
        column_mapping={"name": "Supplier Name"},
    )
    db.add(src)
    db.flush()
    return src


def _make_batch(db: Session, source: DataSource) -> ImportBatch:
    batch = ImportBatch(
        data_source_id=source.id,
        filename="test.csv",
        uploaded_by="testuser",
        status=BatchStatus.COMPLETED,
    )
    db.add(batch)
    db.flush()
    return batch


def _make_supplier(
    db: Session,
    batch: ImportBatch,
    source: DataSource,
    name: str,
) -> StagedSupplier:
    s = StagedSupplier(
        import_batch_id=batch.id,
        data_source_id=source.id,
        name=name,
        normalized_name=name.upper(),
        raw_data={"name": name},
        status=SupplierStatus.ACTIVE,
    )
    db.add(s)
    db.flush()
    return s


def _make_group_with_candidates(db: Session, count: int, status: str = "pending"):
    """Create a MatchGroup with `count` candidates. Returns (group, candidates)."""
    src1 = _make_source(db, f"Source A {count}-{status}")
    src2 = _make_source(db, f"Source B {count}-{status}")
    batch1 = _make_batch(db, src1)
    batch2 = _make_batch(db, src2)

    group = MatchGroup()
    db.add(group)
    db.flush()

    candidates = []
    for i in range(count):
        sa = _make_supplier(db, batch1, src1, f"Supplier A{i}-{status}")
        sb = _make_supplier(db, batch2, src2, f"Supplier B{i}-{status}")
        c = MatchCandidate(
            supplier_a_id=sa.id,
            supplier_b_id=sb.id,
            confidence=0.80 + (i * 0.01),
            match_signals={
                "jaro_winkler": 0.85 + (i * 0.01),
                "token_jaccard": 0.75 + (i * 0.01),
                "embedding_cosine": 0.70 + (i * 0.01),
                "short_name_match": 0.5,
                "currency_match": 0.5,
                "contact_match": 0.5,
            },
            status=status,
            group_id=group.id,
        )
        db.add(c)
        candidates.append(c)
    db.flush()
    return group, candidates


# ---------- Retraining service tests ----------


class TestRetrainWeights:
    """Tests for retraining service."""

    def test_retrain_insufficient_data(self, test_db):
        """With <20 reviewed candidates, returns None."""
        # Create only 5 confirmed
        _make_group_with_candidates(test_db, 5, status="confirmed")
        test_db.flush()

        from app.services.retraining import retrain_weights

        result = retrain_weights(test_db)
        assert result is None

    def test_retrain_with_enough_data(self, test_db):
        """With ≥20 reviewed candidates, returns weights dict."""
        _make_group_with_candidates(test_db, 15, status="confirmed")
        _make_group_with_candidates(test_db, 10, status="rejected")
        test_db.flush()

        from app.services.retraining import retrain_weights

        result = retrain_weights(test_db)
        assert result is not None
        assert "weights" in result
        assert "sample_count" in result
        assert result["sample_count"] >= 20

    def test_retrain_weights_sum_to_one(self, test_db):
        """Returned weights sum to approximately 1.0."""
        _make_group_with_candidates(test_db, 15, status="confirmed")
        _make_group_with_candidates(test_db, 10, status="rejected")
        test_db.flush()

        from app.services.retraining import retrain_weights

        result = retrain_weights(test_db)
        assert result is not None
        total = sum(result["weights"].values())
        assert abs(total - 1.0) < 0.01

    def test_retrain_weights_has_all_signals(self, test_db):
        """Returned weights dict has all 6 signal keys."""
        _make_group_with_candidates(test_db, 15, status="confirmed")
        _make_group_with_candidates(test_db, 10, status="rejected")
        test_db.flush()

        from app.services.retraining import retrain_weights

        result = retrain_weights(test_db)
        assert result is not None
        for key in [
            "jaro_winkler",
            "token_jaccard",
            "embedding_cosine",
            "short_name_match",
            "currency_match",
            "contact_match",
        ]:
            assert key in result["weights"]


# ---------- API tests ----------


class TestMatchGroupsAPI:
    """Tests for GET /api/matching/groups endpoint."""

    def test_groups_empty(self, authenticated_client, test_db):
        """GET /groups returns empty list initially."""
        resp = authenticated_client.get("/api/matching/groups")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_groups_with_data(self, authenticated_client, test_db):
        """GET /groups returns match groups with candidate count."""
        group, candidates = _make_group_with_candidates(test_db, 3)
        test_db.commit()

        resp = authenticated_client.get("/api/matching/groups")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        # Find our group
        found = [g for g in data if g["id"] == group.id]
        assert len(found) == 1
        assert found[0]["candidate_count"] == 3

    def test_groups_requires_auth(self, test_client, test_db):
        """GET /groups returns 401 without auth."""
        resp = test_client.get("/api/matching/groups")
        assert resp.status_code == 401


class TestMatchCandidatesAPI:
    """Tests for GET /api/matching/candidates endpoint."""

    def test_candidates_with_group_filter(self, authenticated_client, test_db):
        """GET /candidates?group_id=X returns filtered candidates."""
        group, candidates = _make_group_with_candidates(test_db, 3)
        test_db.commit()

        resp = authenticated_client.get(f"/api/matching/candidates?group_id={group.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 3

    def test_candidates_with_status_filter(self, authenticated_client, test_db):
        """GET /candidates?status=pending returns filtered candidates."""
        _make_group_with_candidates(test_db, 2, status="pending")
        _make_group_with_candidates(test_db, 3, status="confirmed")
        test_db.commit()

        resp = authenticated_client.get("/api/matching/candidates?status=pending")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert all(c["status"] == "pending" for c in data)

    def test_candidates_include_supplier_names(self, authenticated_client, test_db):
        """Candidates include supplier_a_name and supplier_b_name."""
        group, candidates = _make_group_with_candidates(test_db, 1)
        test_db.commit()

        resp = authenticated_client.get(f"/api/matching/candidates?group_id={group.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["supplier_a_name"] is not None
        assert data[0]["supplier_b_name"] is not None

    def test_candidates_include_signals(self, authenticated_client, test_db):
        """Candidates include match_signals with all 6 keys."""
        group, candidates = _make_group_with_candidates(test_db, 1)
        test_db.commit()

        resp = authenticated_client.get(f"/api/matching/candidates?group_id={group.id}")
        data = resp.json()
        signals = data[0]["match_signals"]
        for key in [
            "jaro_winkler",
            "token_jaccard",
            "embedding_cosine",
            "short_name_match",
            "currency_match",
            "contact_match",
        ]:
            assert key in signals

    def test_candidates_requires_auth(self, test_client, test_db):
        """GET /candidates returns 401 without auth."""
        resp = test_client.get("/api/matching/candidates")
        assert resp.status_code == 401


class TestRetrainAPI:
    """Tests for POST /api/matching/retrain endpoint."""

    def test_retrain_insufficient_data(self, authenticated_client, test_db):
        """POST /retrain with <20 candidates returns 400."""
        _make_group_with_candidates(test_db, 5, status="confirmed")
        test_db.commit()

        resp = authenticated_client.post("/api/matching/retrain")
        assert resp.status_code == 400

    def test_retrain_with_enough_data(self, authenticated_client, test_db):
        """POST /retrain with ≥20 candidates returns 200 with weights."""
        _make_group_with_candidates(test_db, 15, status="confirmed")
        _make_group_with_candidates(test_db, 10, status="rejected")
        test_db.commit()

        resp = authenticated_client.post("/api/matching/retrain")
        assert resp.status_code == 200
        data = resp.json()
        assert "weights" in data
        assert "sample_count" in data

    def test_retrain_requires_auth(self, test_client, test_db):
        """POST /retrain returns 401 without auth."""
        resp = test_client.post("/api/matching/retrain")
        assert resp.status_code == 401
