"""Tests for unified suppliers — browse, detail, singleton promotion, export, dashboard."""

from app.models.batch import ImportBatch
from app.models.enums import BatchStatus, CandidateStatus, SupplierStatus
from app.models.match import MatchCandidate
from app.models.source import DataSource
from app.models.staging import StagedSupplier
from app.models.unified import UnifiedSupplier


def _seed_sources(db):
    """Create two data sources."""
    s1 = DataSource(name="EOT", description="EOT entity", column_mapping={"supplier_name": "BPSNAM"})
    s2 = DataSource(name="TTEI", description="TTEI entity", column_mapping={"supplier_name": "BPSNAM"})
    db.add_all([s1, s2])
    db.flush()
    return s1, s2


def _seed_batch(db, source):
    """Create an import batch."""
    b = ImportBatch(
        data_source_id=source.id,
        filename="test.csv",
        uploaded_by="testuser",
        status=BatchStatus.COMPLETED,
        row_count=10,
    )
    db.add(b)
    db.flush()
    return b


def _seed_staged(db, source, batch, name, source_code="FE001"):
    """Create a staged supplier."""
    s = StagedSupplier(
        import_batch_id=batch.id,
        data_source_id=source.id,
        name=name,
        source_code=source_code,
        short_name="TST",
        currency="EUR",
        raw_data={"BPSNAM": name},
        status=SupplierStatus.ACTIVE,
    )
    db.add(s)
    db.flush()
    return s


def _seed_unified(db, name, source_ids, match_candidate_id=None, created_by="testuser"):
    """Create a unified supplier."""
    u = UnifiedSupplier(
        name=name,
        source_code="U001",
        provenance={
            "name": {
                "value": name,
                "source_entity": "EOT",
                "source_record_id": source_ids[0],
                "auto": True,
                "chosen_by": created_by,
                "chosen_at": "2026-03-15T08:00:00",
            }
        },
        source_supplier_ids=source_ids,
        match_candidate_id=match_candidate_id,
        created_by=created_by,
    )
    db.add(u)
    db.flush()
    return u


# ── Browse tests ──


class TestUnifiedBrowse:
    def test_list_empty(self, authenticated_client):
        resp = authenticated_client.get("/api/unified/suppliers")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    def test_list_with_records(self, authenticated_client, test_db):
        _seed_unified(test_db, "ACME CORP", [1, 2], match_candidate_id=1)
        _seed_unified(test_db, "GLOBEX INC", [3])
        test_db.commit()

        resp = authenticated_client.get("/api/unified/suppliers")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2

    def test_search_filter(self, authenticated_client, test_db):
        _seed_unified(test_db, "ACME CORP", [1, 2], match_candidate_id=1)
        _seed_unified(test_db, "GLOBEX INC", [3])
        test_db.commit()

        resp = authenticated_client.get("/api/unified/suppliers?search=ACME")
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["name"] == "ACME CORP"

    def test_source_type_filter_singleton(self, authenticated_client, test_db):
        _seed_unified(test_db, "MERGED CO", [1, 2], match_candidate_id=1)
        _seed_unified(test_db, "SINGLETON CO", [3])
        test_db.commit()

        resp = authenticated_client.get("/api/unified/suppliers?source_type=singleton")
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["is_singleton"] is True

    def test_source_type_filter_merged(self, authenticated_client, test_db):
        _seed_unified(test_db, "MERGED CO", [1, 2], match_candidate_id=1)
        _seed_unified(test_db, "SINGLETON CO", [3])
        test_db.commit()

        resp = authenticated_client.get("/api/unified/suppliers?source_type=merged")
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["is_singleton"] is False


# ── Detail tests ──


class TestUnifiedDetail:
    def test_detail_not_found(self, authenticated_client):
        resp = authenticated_client.get("/api/unified/suppliers/999")
        assert resp.status_code == 404

    def test_detail_with_provenance(self, authenticated_client, test_db):
        s1, s2 = _seed_sources(test_db)
        b1 = _seed_batch(test_db, s1)
        sup = _seed_staged(test_db, s1, b1, "DETAIL CORP")
        u = _seed_unified(test_db, "DETAIL CORP", [sup.id])
        test_db.commit()

        resp = authenticated_client.get(f"/api/unified/suppliers/{u.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "DETAIL CORP"
        assert "name" in data["provenance"]
        assert data["provenance"]["name"]["source_entity"] == "EOT"
        assert len(data["source_records"]) == 1
        assert data["source_records"][0]["name"] == "DETAIL CORP"


# ── Singleton promotion tests ──


class TestSingletonPromotion:
    def test_list_singletons_empty(self, authenticated_client):
        resp = authenticated_client.get("/api/unified/singletons")
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    def test_list_singletons_excludes_non_representative_group_members(self, authenticated_client, test_db):
        """Non-representative group members should NOT appear in singletons."""
        s1, _ = _seed_sources(test_db)
        b1 = _seed_batch(test_db, s1)
        rep = _seed_staged(test_db, s1, b1, "GROUP REP", "FE001")
        member = _seed_staged(test_db, s1, b1, "GROUP REP", "FE002")
        _ungrouped = _seed_staged(test_db, s1, b1, "UNGROUPED", "FE003")

        # Mark rep as representative (group_id = self.id)
        rep.intra_source_group_id = rep.id
        # Mark member as non-representative (group_id = rep.id)
        member.intra_source_group_id = rep.id
        # ungrouped stays NULL
        test_db.commit()

        resp = authenticated_client.get("/api/unified/singletons")
        data = resp.json()
        names = [item["name"] for item in data["items"]]
        # Rep and ungrouped should appear; non-representative member should not
        assert names.count("GROUP REP") == 1  # only the representative, not the member
        assert "UNGROUPED" in names
        assert data["total"] == 2  # rep + ungrouped, NOT the member

    def test_list_singletons_excludes_matched(self, authenticated_client, test_db):
        s1, s2 = _seed_sources(test_db)
        b1 = _seed_batch(test_db, s1)
        b2 = _seed_batch(test_db, s2)
        sup_a = _seed_staged(test_db, s1, b1, "MATCHED A")
        sup_b = _seed_staged(test_db, s2, b2, "MATCHED B")
        _sup_c = _seed_staged(test_db, s1, b1, "SINGLETON C", "FE003")

        # Create a match candidate for A and B
        mc = MatchCandidate(
            supplier_a_id=sup_a.id,
            supplier_b_id=sup_b.id,
            confidence=0.85,
            match_signals={"jw": 0.9},
            status=CandidateStatus.PENDING,
        )
        test_db.add(mc)
        test_db.commit()

        resp = authenticated_client.get("/api/unified/singletons")
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["name"] == "SINGLETON C"

    def test_promote_singleton(self, authenticated_client, test_db):
        s1, _ = _seed_sources(test_db)
        b1 = _seed_batch(test_db, s1)
        sup = _seed_staged(test_db, s1, b1, "PROMOTE ME")
        test_db.commit()

        resp = authenticated_client.post(f"/api/unified/singletons/{sup.id}/promote")
        assert resp.status_code == 200
        data = resp.json()
        assert data["supplier_name"] == "PROMOTE ME"
        assert data["unified_supplier_id"] > 0

        # Verify in DB
        unified = test_db.query(UnifiedSupplier).filter(UnifiedSupplier.id == data["unified_supplier_id"]).one()
        assert unified.name == "PROMOTE ME"
        assert unified.match_candidate_id is None  # singleton
        assert "name" in unified.provenance

    def test_promote_already_unified(self, authenticated_client, test_db):
        s1, _ = _seed_sources(test_db)
        b1 = _seed_batch(test_db, s1)
        sup = _seed_staged(test_db, s1, b1, "ALREADY UNIFIED")
        _seed_unified(test_db, "ALREADY UNIFIED", [sup.id])
        test_db.commit()

        resp = authenticated_client.post(f"/api/unified/singletons/{sup.id}/promote")
        assert resp.status_code == 400
        assert "already exists" in resp.json()["detail"]

    def test_bulk_promote(self, authenticated_client, test_db):
        s1, _ = _seed_sources(test_db)
        b1 = _seed_batch(test_db, s1)
        sup1 = _seed_staged(test_db, s1, b1, "BULK ONE", "FE010")
        sup2 = _seed_staged(test_db, s1, b1, "BULK TWO", "FE011")
        test_db.commit()

        resp = authenticated_client.post(
            "/api/unified/singletons/bulk-promote",
            json={"supplier_ids": [sup1.id, sup2.id]},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["promoted_count"] == 2
        assert len(data["unified_supplier_ids"]) == 2


# ── Export tests ──


class TestExport:
    def test_export_csv_empty(self, authenticated_client):
        resp = authenticated_client.get("/api/unified/export")
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]
        lines = resp.text.strip().split("\n")
        assert len(lines) == 1  # header only

    def test_export_csv_with_data(self, authenticated_client, test_db):
        _seed_unified(test_db, "EXPORT CORP", [1, 2], match_candidate_id=1)
        _seed_unified(test_db, "EXPORT SINGLE", [3])
        test_db.commit()

        resp = authenticated_client.get("/api/unified/export")
        assert resp.status_code == 200
        lines = resp.text.strip().split("\n")
        assert len(lines) == 3  # header + 2 rows
        assert "EXPORT" in lines[1]

    def test_export_filter_source_type(self, authenticated_client, test_db):
        _seed_unified(test_db, "MERGED CO", [1, 2], match_candidate_id=1)
        _seed_unified(test_db, "SINGLE CO", [3])
        test_db.commit()

        resp = authenticated_client.get("/api/unified/export?source_type=merged")
        assert resp.status_code == 200
        lines = resp.text.strip().split("\n")
        assert len(lines) == 2  # header + 1 merged row
        assert "MERGED CO" in resp.text
        assert "SINGLE CO" not in resp.text

    def test_export_filter_date_range(self, authenticated_client, test_db):
        from datetime import datetime

        u_old = _seed_unified(test_db, "OLD CO", [1])
        u_old.created_at = datetime(2025, 6, 1, 12, 0, 0)
        u_new = _seed_unified(test_db, "NEW CO", [2])
        u_new.created_at = datetime(2026, 3, 15, 12, 0, 0)
        test_db.commit()

        resp = authenticated_client.get("/api/unified/export?from_date=2026-01-01&to_date=2026-12-31")
        assert resp.status_code == 200
        lines = resp.text.strip().split("\n")
        assert len(lines) == 2  # header + 1 in-range row
        assert "NEW CO" in resp.text
        assert "OLD CO" not in resp.text

    def test_export_filter_combined(self, authenticated_client, test_db):
        from datetime import datetime

        u1 = _seed_unified(test_db, "RECENT MERGED", [1, 2], match_candidate_id=1)
        u1.created_at = datetime(2026, 3, 15, 12, 0, 0)
        u2 = _seed_unified(test_db, "OLD MERGED", [3, 4], match_candidate_id=2)
        u2.created_at = datetime(2025, 6, 1, 12, 0, 0)
        u3 = _seed_unified(test_db, "RECENT SINGLETON", [5])
        u3.created_at = datetime(2026, 3, 15, 12, 0, 0)
        test_db.commit()

        resp = authenticated_client.get("/api/unified/export?source_type=merged&from_date=2026-01-01")
        assert resp.status_code == 200
        lines = resp.text.strip().split("\n")
        assert len(lines) == 2  # header + 1 row
        assert "RECENT MERGED" in resp.text
        assert "OLD MERGED" not in resp.text
        assert "RECENT SINGLETON" not in resp.text


# ── Dashboard tests ──


class TestDashboard:
    def test_dashboard_empty(self, authenticated_client):
        resp = authenticated_client.get("/api/unified/dashboard")
        assert resp.status_code == 200
        data = resp.json()
        assert data["uploads"]["total_batches"] == 0
        assert data["matching"]["total_candidates"] == 0
        assert data["review"]["pending"] == 0
        assert data["unified"]["total_unified"] == 0
        assert data["recent_activity"] == []

    def test_dashboard_with_data(self, authenticated_client, test_db):
        s1, s2 = _seed_sources(test_db)
        b1 = _seed_batch(test_db, s1)
        sup_a = _seed_staged(test_db, s1, b1, "DASH A")
        sup_b = _seed_staged(test_db, s2, _seed_batch(test_db, s2), "DASH B")

        mc = MatchCandidate(
            supplier_a_id=sup_a.id,
            supplier_b_id=sup_b.id,
            confidence=0.80,
            match_signals={"jw": 0.8},
            status=CandidateStatus.PENDING,
        )
        test_db.add(mc)

        _seed_unified(test_db, "DASH UNIFIED", [sup_a.id, sup_b.id], match_candidate_id=1)
        test_db.commit()

        resp = authenticated_client.get("/api/unified/dashboard")
        assert resp.status_code == 200
        data = resp.json()
        assert data["uploads"]["total_batches"] == 2
        assert data["uploads"]["completed"] == 2
        assert data["uploads"]["total_staged"] == 2
        assert data["matching"]["total_candidates"] == 1
        assert data["review"]["pending"] == 1
        assert data["unified"]["total_unified"] == 1
        assert data["unified"]["merged"] == 1
