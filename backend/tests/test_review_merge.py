"""Tests for merge service and review API endpoints."""

import pytest
from sqlalchemy.orm import Session

from app.models.match import MatchCandidate, MatchGroup
from app.models.staging import StagedSupplier
from app.models.source import DataSource
from app.models.batch import ImportBatch
from app.models.unified import UnifiedSupplier
from app.services.merge import compare_fields, execute_merge, reject_candidate, skip_candidate


# ── Helpers ──


def _make_source(db: Session, name: str) -> DataSource:
    src = DataSource(name=name, file_format="csv", column_mapping={"name": "N"})
    db.add(src)
    db.flush()
    return src


def _make_batch(db: Session, source: DataSource) -> ImportBatch:
    batch = ImportBatch(
        data_source_id=source.id,
        filename="test.csv",
        uploaded_by="testuser",
        status="completed",
    )
    db.add(batch)
    db.flush()
    return batch


def _make_supplier(
    db: Session,
    batch: ImportBatch,
    source: DataSource,
    name: str,
    short_name: str | None = None,
    currency: str | None = None,
    contact_name: str | None = None,
    source_code: str | None = None,
) -> StagedSupplier:
    s = StagedSupplier(
        import_batch_id=batch.id,
        data_source_id=source.id,
        name=name,
        normalized_name=name.upper(),
        raw_data={"name": name},
        status="active",
        short_name=short_name,
        currency=currency,
        contact_name=contact_name,
        source_code=source_code,
    )
    db.add(s)
    db.flush()
    return s


def _make_candidate(
    db: Session, sup_a: StagedSupplier, sup_b: StagedSupplier, confidence: float = 0.9
) -> MatchCandidate:
    c = MatchCandidate(
        supplier_a_id=sup_a.id,
        supplier_b_id=sup_b.id,
        confidence=confidence,
        match_signals={
            "jaro_winkler": 0.95,
            "token_jaccard": 0.8,
            "embedding_cosine": 0.85,
            "short_name_match": 0.5,
            "currency_match": 1.0,
            "contact_match": 0.0,
        },
        status="pending",
    )
    db.add(c)
    db.flush()
    return c


def _setup_pair(db: Session):
    """Create a typical matched pair from two different sources."""
    src_eot = _make_source(db, "EOT")
    src_ttei = _make_source(db, "TTEI")
    batch_eot = _make_batch(db, src_eot)
    batch_ttei = _make_batch(db, src_ttei)

    sup_a = _make_supplier(
        db, batch_eot, src_eot,
        name="ACME CORP",
        short_name="ACME",
        currency="EUR",
        contact_name="John Doe",
        source_code="FE001",
    )
    sup_b = _make_supplier(
        db, batch_ttei, src_ttei,
        name="ACME CORPORATION",
        short_name="ACME",
        currency="USD",
        contact_name=None,
        source_code="FL001",
    )

    candidate = _make_candidate(db, sup_a, sup_b)
    db.commit()

    return sup_a, sup_b, candidate, src_eot, src_ttei


# ── compare_fields tests ──


class TestCompareFields:
    def test_identical_field_detection(self, test_db):
        """Identical values across sources are flagged as identical."""
        sup_a, sup_b, _, _, _ = _setup_pair(test_db)

        comparisons = compare_fields(sup_a, sup_b, "EOT", "TTEI")
        short_name = next(c for c in comparisons if c["field"] == "short_name")

        assert short_name["is_identical"] is True
        assert short_name["is_conflict"] is False
        assert short_name["value_a"] == "ACME"
        assert short_name["value_b"] == "ACME"

    def test_conflict_detection(self, test_db):
        """Different values for same field are flagged as conflict."""
        sup_a, sup_b, _, _, _ = _setup_pair(test_db)

        comparisons = compare_fields(sup_a, sup_b, "EOT", "TTEI")
        name_comp = next(c for c in comparisons if c["field"] == "name")

        assert name_comp["is_conflict"] is True
        assert name_comp["value_a"] == "ACME CORP"
        assert name_comp["value_b"] == "ACME CORPORATION"

    def test_source_only_detection(self, test_db):
        """Value present in only one source is flagged as source-only."""
        sup_a, sup_b, _, _, _ = _setup_pair(test_db)

        comparisons = compare_fields(sup_a, sup_b, "EOT", "TTEI")
        contact = next(c for c in comparisons if c["field"] == "contact_name")

        assert contact["is_a_only"] is True
        assert contact["value_a"] == "John Doe"
        assert contact["value_b"] is None

    def test_currency_conflict(self, test_db):
        """Different currencies are flagged as conflict."""
        sup_a, sup_b, _, _, _ = _setup_pair(test_db)

        comparisons = compare_fields(sup_a, sup_b, "EOT", "TTEI")
        currency = next(c for c in comparisons if c["field"] == "currency")

        assert currency["is_conflict"] is True
        assert currency["value_a"] == "EUR"
        assert currency["value_b"] == "USD"


# ── execute_merge tests ──


class TestExecuteMerge:
    def test_merge_with_field_selections(self, test_db):
        """Merge resolves conflicts via user selections, auto-includes rest."""
        sup_a, sup_b, candidate, _, _ = _setup_pair(test_db)

        selections = [
            {"field": "name", "chosen_supplier_id": sup_a.id},
            {"field": "currency", "chosen_supplier_id": sup_b.id},
            {"field": "source_code", "chosen_supplier_id": sup_a.id},
        ]

        unified = execute_merge(
            db=test_db,
            candidate=candidate,
            supplier_a=sup_a,
            supplier_b=sup_b,
            source_a_name="EOT",
            source_b_name="TTEI",
            field_selections=selections,
            username="testuser",
        )
        test_db.commit()

        assert unified.name == "ACME CORP"  # chosen from A
        assert unified.currency == "USD"  # chosen from B
        assert unified.short_name == "ACME"  # identical — auto
        assert unified.contact_name == "John Doe"  # A-only — auto
        assert unified.source_code == "FE001"  # chosen from A

        # Provenance
        assert unified.provenance["name"]["auto"] is False
        assert unified.provenance["short_name"]["auto"] is True
        assert unified.provenance["contact_name"]["auto"] is True
        assert unified.provenance["contact_name"]["source_entity"] == "EOT"

        # Candidate marked confirmed
        assert candidate.status == "confirmed"
        assert candidate.reviewed_by == "testuser"

    def test_merge_missing_conflict_selection_raises(self, test_db):
        """Merge fails if a conflicting field has no selection."""
        sup_a, sup_b, candidate, _, _ = _setup_pair(test_db)

        with pytest.raises(ValueError, match="Missing field selection"):
            execute_merge(
                db=test_db,
                candidate=candidate,
                supplier_a=sup_a,
                supplier_b=sup_b,
                source_a_name="EOT",
                source_b_name="TTEI",
                field_selections=[],  # Missing selections for name, currency, source_code
                username="testuser",
            )

    def test_merge_records_source_supplier_ids(self, test_db):
        """Unified record tracks which staged suppliers were merged."""
        sup_a, sup_b, candidate, _, _ = _setup_pair(test_db)

        selections = [
            {"field": "name", "chosen_supplier_id": sup_a.id},
            {"field": "currency", "chosen_supplier_id": sup_a.id},
            {"field": "source_code", "chosen_supplier_id": sup_a.id},
        ]

        unified = execute_merge(
            db=test_db,
            candidate=candidate,
            supplier_a=sup_a,
            supplier_b=sup_b,
            source_a_name="EOT",
            source_b_name="TTEI",
            field_selections=selections,
            username="testuser",
        )
        test_db.commit()

        assert set(unified.source_supplier_ids) == {sup_a.id, sup_b.id}


# ── reject/skip tests ──


class TestRejectSkip:
    def test_reject_candidate(self, test_db):
        sup_a, sup_b, candidate, _, _ = _setup_pair(test_db)

        reject_candidate(test_db, candidate, "reviewer1")
        test_db.commit()

        assert candidate.status == "rejected"
        assert candidate.reviewed_by == "reviewer1"

    def test_skip_candidate(self, test_db):
        sup_a, sup_b, candidate, _, _ = _setup_pair(test_db)

        skip_candidate(test_db, candidate, "reviewer1")
        test_db.commit()

        assert candidate.status == "skipped"
        assert candidate.reviewed_by == "reviewer1"


# ── API endpoint tests ──


class TestReviewAPI:
    def _setup_data(self, db):
        """Set up test data and return supplier IDs for assertions."""
        src_eot = _make_source(db, "EOT")
        src_ttei = _make_source(db, "TTEI")
        batch_eot = _make_batch(db, src_eot)
        batch_ttei = _make_batch(db, src_ttei)

        sup_a = _make_supplier(
            db, batch_eot, src_eot, "ACME CORP",
            short_name="ACME", currency="EUR", source_code="FE001",
        )
        sup_b = _make_supplier(
            db, batch_ttei, src_ttei, "ACME CORPORATION",
            short_name="ACME", currency="USD", source_code="FL001",
        )
        candidate = _make_candidate(db, sup_a, sup_b)
        db.commit()
        return sup_a, sup_b, candidate

    def test_review_queue(self, authenticated_client, test_db):
        sup_a, sup_b, candidate = self._setup_data(test_db)

        resp = authenticated_client.get("/api/review/queue")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["id"] == candidate.id
        assert data["items"][0]["supplier_a_name"] == "ACME CORP"

    def test_match_detail(self, authenticated_client, test_db):
        sup_a, sup_b, candidate = self._setup_data(test_db)

        resp = authenticated_client.get(f"/api/review/candidates/{candidate.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["supplier_a"]["name"] == "ACME CORP"
        assert data["supplier_b"]["name"] == "ACME CORPORATION"
        assert len(data["field_comparisons"]) == 7  # all canonical fields

        # Check conflict detection
        name_comp = next(c for c in data["field_comparisons"] if c["field"] == "name")
        assert name_comp["is_conflict"] is True

    def test_merge_endpoint(self, authenticated_client, test_db):
        sup_a, sup_b, candidate = self._setup_data(test_db)

        resp = authenticated_client.post(
            f"/api/review/candidates/{candidate.id}/merge",
            json={
                "field_selections": [
                    {"field": "name", "chosen_supplier_id": sup_a.id},
                    {"field": "currency", "chosen_supplier_id": sup_a.id},
                    {"field": "source_code", "chosen_supplier_id": sup_a.id},
                ]
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["action"] == "merged"
        assert data["unified_supplier_id"] is not None

        # Verify unified record was created
        unified = test_db.query(UnifiedSupplier).first()
        assert unified is not None
        assert unified.name == "ACME CORP"

    def test_reject_endpoint(self, authenticated_client, test_db):
        _, _, candidate = self._setup_data(test_db)

        resp = authenticated_client.post(
            f"/api/review/candidates/{candidate.id}/reject"
        )
        assert resp.status_code == 200
        assert resp.json()["action"] == "rejected"

    def test_skip_endpoint(self, authenticated_client, test_db):
        _, _, candidate = self._setup_data(test_db)

        resp = authenticated_client.post(
            f"/api/review/candidates/{candidate.id}/skip"
        )
        assert resp.status_code == 200
        assert resp.json()["action"] == "skipped"

    def test_cannot_merge_already_rejected(self, authenticated_client, test_db):
        sup_a, sup_b, candidate = self._setup_data(test_db)

        # First reject
        authenticated_client.post(f"/api/review/candidates/{candidate.id}/reject")

        # Then try merge
        resp = authenticated_client.post(
            f"/api/review/candidates/{candidate.id}/merge",
            json={"field_selections": []},
        )
        assert resp.status_code == 400

    def test_review_stats(self, authenticated_client, test_db):
        self._setup_data(test_db)

        resp = authenticated_client.get("/api/review/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_pending"] == 1
        assert data["total_confirmed"] == 0

    def test_confidence_range_filter(self, authenticated_client, test_db):
        self._setup_data(test_db)

        # Filter by high confidence — should match (candidate is 0.9)
        resp = authenticated_client.get("/api/review/queue?min_confidence=0.8")
        assert resp.json()["total"] == 1

        # Filter by very high — should not match
        resp = authenticated_client.get("/api/review/queue?min_confidence=0.95")
        assert resp.json()["total"] == 0
