"""Tests for unified records — browse, detail, singleton promotion, export, dashboard."""

import os

import pytest

from app.models.audit import AuditLog
from app.models.batch import ImportBatch
from app.models.enums import BatchStatus, CandidateStatus, RecordStatus
from app.models.match import MatchCandidate
from app.models.match_run import MatchRun
from app.models.source import DataSource
from app.models.staging import StagedRecord
from app.models.unified import UnifiedRecord

# Skip tests that rely on the Postgres-only `jsonb_array_length` function when running
# against SQLite. The app ships on Postgres; SQLite is for fast local iteration.
# CI runs a dedicated Postgres job (TEST_DATABASE_URL=postgresql://...) where these execute.
requires_postgres = pytest.mark.skipif(
    "sqlite" in os.environ.get("TEST_DATABASE_URL", "sqlite://"),
    reason="Requires PostgreSQL (uses jsonb_array_length)",
)


def _seed_sources(db):
    """Create two data sources."""
    s1 = DataSource(
        name="EOT",
        type="supplier",
        description="EOT entity",
        column_mapping={"supplier_name": "BPSNAM"},
    )
    s2 = DataSource(
        name="TTEI",
        type="supplier",
        description="TTEI entity",
        column_mapping={"supplier_name": "BPSNAM"},
    )
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
    """Create a staged record."""
    s = StagedRecord(
        type="supplier",
        import_batch_id=batch.id,
        data_source_id=source.id,
        name=name,
        normalized_name=name.upper(),
        raw_data={"BPSNAM": name},
        status=RecordStatus.ACTIVE,
        fields={
            "supplier_name": name,
            "short_name": source_code,
            "currency": "EUR",
        },
    )
    db.add(s)
    db.flush()
    return s


def _seed_unified(db, name, source_ids, match_candidate_id=None, created_by="testuser"):
    """Create a unified record."""
    u = UnifiedRecord(
        type="supplier",
        name=name,
        fields={"supplier_name": name, "short_name": "U001"},
        provenance={
            "supplier_name": {
                "value": name,
                "source_entity": "EOT",
                "source_record_id": source_ids[0],
                "auto": True,
                "chosen_by": created_by,
                "chosen_at": "2026-03-15T08:00:00",
            }
        },
        source_record_ids=source_ids,
        created_by=created_by,
    )
    db.add(u)
    db.flush()
    return u


# ── Browse tests ──


class TestUnifiedBrowse:
    def test_list_empty(self, authenticated_client):
        resp = authenticated_client.get("/api/unified/records")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    def test_list_with_records(self, authenticated_client, test_db):
        _seed_unified(test_db, "ACME CORP", [1, 2], match_candidate_id=1)
        _seed_unified(test_db, "GLOBEX INC", [3])
        test_db.commit()

        resp = authenticated_client.get("/api/unified/records")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2

    def test_search_filter(self, authenticated_client, test_db):
        _seed_unified(test_db, "ACME CORP", [1, 2], match_candidate_id=1)
        _seed_unified(test_db, "GLOBEX INC", [3])
        test_db.commit()

        resp = authenticated_client.get("/api/unified/records?search=ACME")
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["name"] == "ACME CORP"

    @requires_postgres
    def test_source_type_filter_singleton(self, authenticated_client, test_db):
        _seed_unified(test_db, "MERGED CO", [1, 2], match_candidate_id=1)
        _seed_unified(test_db, "SINGLETON CO", [3])
        test_db.commit()

        resp = authenticated_client.get("/api/unified/records?is_singleton=true")
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["is_singleton"] is True

    @requires_postgres
    def test_source_type_filter_merged(self, authenticated_client, test_db):
        _seed_unified(test_db, "MERGED CO", [1, 2], match_candidate_id=1)
        _seed_unified(test_db, "SINGLETON CO", [3])
        test_db.commit()

        resp = authenticated_client.get("/api/unified/records?is_singleton=false")
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["is_singleton"] is False


# ── Detail tests ──


class TestUnifiedDetail:
    def test_detail_not_found(self, authenticated_client):
        resp = authenticated_client.get("/api/unified/records/999")
        assert resp.status_code == 404

    def test_detail_with_provenance(self, authenticated_client, test_db):
        s1, s2 = _seed_sources(test_db)
        b1 = _seed_batch(test_db, s1)
        sup = _seed_staged(test_db, s1, b1, "DETAIL CORP")
        u = _seed_unified(test_db, "DETAIL CORP", [sup.id])
        test_db.commit()

        resp = authenticated_client.get(f"/api/unified/records/{u.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "DETAIL CORP"
        assert "supplier_name" in data["provenance"]
        assert data["provenance"]["supplier_name"]["source_entity"] == "EOT"
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
        run = MatchRun(type="supplier", mode="FILE_VS_FILE", status="pending", created_by="u")
        test_db.add(run)
        test_db.flush()
        mc = MatchCandidate(
            type="supplier",
            match_run_id=run.id,
            record_a_id=sup_a.id,
            record_b_id=sup_b.id,
            confidence=0.85,
            match_signals={"jaro_winkler:supplier_name": 0.9},
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
        assert data["record_name"] == "PROMOTE ME"
        assert data["unified_record_id"] > 0

        # Verify in DB
        unified = test_db.query(UnifiedRecord).filter(UnifiedRecord.id == data["unified_record_id"]).one()
        assert unified.name == "PROMOTE ME"
        assert len(unified.source_record_ids) == 1  # singleton
        assert "supplier_name" in unified.provenance

    def test_promote_singleton_rejects_missing_name(self, authenticated_client, test_db):
        s1, _ = _seed_sources(test_db)
        b1 = _seed_batch(test_db, s1)
        record = StagedRecord(
            type="supplier",
            import_batch_id=b1.id,
            data_source_id=s1.id,
            name=None,
            normalized_name="",
            raw_data={"BPSNAM": ""},
            status=RecordStatus.ACTIVE,
            fields={"short_name": "NO-NAME"},
        )
        test_db.add(record)
        test_db.commit()

        resp = authenticated_client.post(f"/api/unified/singletons/{record.id}/promote")
        assert resp.status_code == 400
        assert "supplier_name" in resp.json()["detail"]

    def test_promote_already_unified(self, authenticated_client, test_db):
        s1, _ = _seed_sources(test_db)
        b1 = _seed_batch(test_db, s1)
        sup = _seed_staged(test_db, s1, b1, "ALREADY UNIFIED")
        _seed_unified(test_db, "ALREADY UNIFIED", [sup.id])
        test_db.commit()

        resp = authenticated_client.post(f"/api/unified/singletons/{sup.id}/promote")
        assert resp.status_code == 409
        assert "already" in resp.json()["detail"].lower()

    def test_bulk_promote(self, authenticated_client, test_db):
        s1, _ = _seed_sources(test_db)
        b1 = _seed_batch(test_db, s1)
        sup1 = _seed_staged(test_db, s1, b1, "BULK ONE", "FE010")
        sup2 = _seed_staged(test_db, s1, b1, "BULK TWO", "FE011")
        test_db.commit()

        resp = authenticated_client.post(
            "/api/unified/singletons/bulk-promote",
            json={"record_ids": [sup1.id, sup2.id]},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["promoted_count"] == 2
        assert len(data["unified_record_ids"]) == 2


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

    def test_export_filter_by_type(self, authenticated_client, test_db):
        """Export with type=supplier returns only supplier records."""
        _seed_unified(test_db, "MERGED CO", [1, 2], match_candidate_id=1)
        _seed_unified(test_db, "SINGLE CO", [3])
        test_db.commit()

        resp = authenticated_client.get("/api/unified/export?type=supplier")
        assert resp.status_code == 200
        lines = resp.text.strip().split("\n")
        assert len(lines) == 3  # header + 2 supplier rows
        assert "MERGED CO" in resp.text
        assert "SINGLE CO" in resp.text


# ── Dashboard tests ──


class TestDashboard:
    @requires_postgres
    def test_dashboard_empty(self, authenticated_client):
        resp = authenticated_client.get("/api/unified/dashboard")
        assert resp.status_code == 200
        data = resp.json()
        assert data["uploads"]["total_batches"] == 0
        assert data["matching"]["total_candidates"] == 0
        assert data["review"]["pending"] == 0
        assert data["unified"]["total_unified"] == 0
        assert data["recent_activity"] == []

    @requires_postgres
    def test_dashboard_with_data(self, authenticated_client, test_db):
        s1, s2 = _seed_sources(test_db)
        b1 = _seed_batch(test_db, s1)
        sup_a = _seed_staged(test_db, s1, b1, "DASH A")
        sup_b = _seed_staged(test_db, s2, _seed_batch(test_db, s2), "DASH B")

        run = MatchRun(type="supplier", mode="FILE_VS_FILE", status="pending", created_by="u")
        test_db.add(run)
        test_db.flush()
        mc = MatchCandidate(
            type="supplier",
            match_run_id=run.id,
            record_a_id=sup_a.id,
            record_b_id=sup_b.id,
            confidence=0.80,
            match_signals={"jaro_winkler:supplier_name": 0.8},
            status=CandidateStatus.PENDING,
        )
        test_db.add(mc)

        _seed_unified(test_db, "DASH UNIFIED", [sup_a.id, sup_b.id])
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

    @requires_postgres
    def test_dashboard_type_filter_scopes_recent_activity(self, authenticated_client, test_db):
        test_db.add_all(
            [
                AuditLog(action="upload", entity_type="import_batch", details={"type": "supplier"}),
                AuditLog(action="upload", entity_type="import_batch", details={"type": "material"}),
            ]
        )
        test_db.commit()

        resp = authenticated_client.get("/api/unified/dashboard?type=supplier")
        assert resp.status_code == 200
        actions = [item["action"] for item in resp.json()["recent_activity"]]
        assert actions == ["supplier_action"]

    @requires_postgres
    def test_dashboard_recent_activity_is_curated_with_actor(self, authenticated_client, test_db):
        from app.models.user import User

        user = test_db.query(User).filter(User.username == "testuser").one()
        test_db.add_all(
            [
                AuditLog(
                    user_id=user.id,
                    action="upload",
                    entity_type="import_batch",
                    entity_id=10,
                    details={"filename": "noisy_supplier_upload.csv", "type": "supplier"},
                ),
                *[
                    AuditLog(
                        action="match_rejected",
                        entity_type="match_candidate",
                        entity_id=20 + i,
                        details={"type": "supplier", "reviewed_by": "reviewer", "name": f"Noisy Candidate Name {i}"},
                    )
                    for i in range(3)
                ],
                AuditLog(
                    action="singleton_promoted",
                    entity_type="unified_record",
                    entity_id=50,
                    details={"type": "supplier", "chosen_by": "reviewer", "name": "Noisy Singleton Name"},
                ),
                AuditLog(
                    user_id=user.id,
                    action="login",
                    entity_type="user",
                    entity_id=user.id,
                    details={"type": "supplier"},
                ),
            ]
        )
        test_db.commit()

        resp = authenticated_client.get("/api/unified/dashboard?type=supplier")
        assert resp.status_code == 200
        activity = resp.json()["recent_activity"]
        by_action = {item["action"]: item for item in activity}

        assert set(by_action) == {"match_rejected", "upload"}
        assert by_action["match_rejected"]["actor"] == "reviewer"
        assert by_action["match_rejected"]["title"] == "Rejected 3 match candidates"
        assert by_action["match_rejected"]["tone"] == "warn"
        assert "Noisy Candidate Name" not in by_action["match_rejected"]["title"]
        assert by_action["upload"]["actor"] == "testuser"
        assert by_action["upload"]["title"] == "Uploaded supplier batch"


# ── DQ score exposure tests ──


def test_unified_list_includes_dq_fields(authenticated_client, test_db):
    from app.models.unified import UnifiedRecord

    test_db.add(
        UnifiedRecord(
            type="supplier",
            name="Test Co",
            fields={"name": "Test Co"},
            provenance={},
            source_record_ids=[],
            created_by="testuser",
            dq_completeness=0.8,
            dq_validity=1.0,
            dq_score=0.9,
        )
    )
    test_db.commit()

    resp = authenticated_client.get("/api/unified/records")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert items
    item = items[0]
    assert item["dq_score"] == 0.9
    assert item["dq_completeness"] == 0.8
    assert item["dq_validity"] == 1.0


def test_lineage_returns_events_for_record(authenticated_client, test_db):
    from app.models.audit import AuditLog
    from app.models.unified import UnifiedRecord

    rec = UnifiedRecord(
        type="supplier",
        name="Acme",
        fields={"name": "Acme", "email": "a@b.com"},
        provenance={
            "name": {
                "value": "Acme",
                "source_entity": "SrcA",
                "chosen_by": "alice",
                "chosen_at": "2026-05-10T10:00:00Z",
                "auto": True,
            },
            "email": {
                "value": "a@b.com",
                "source_entity": "SrcB",
                "chosen_by": "bob",
                "chosen_at": "2026-05-11T11:00:00Z",
                "auto": False,
            },
        },
        source_record_ids=[],
        created_by="alice",
    )
    test_db.add(rec)
    test_db.commit()
    test_db.refresh(rec)
    test_db.add(
        AuditLog(
            action="merge_confirmed",
            entity_type="unified_record",
            entity_id=rec.id,
            details={"name": "Acme"},
        )
    )
    test_db.commit()

    resp = authenticated_client.get(f"/api/unified/{rec.id}/lineage")
    assert resp.status_code == 200
    events = resp.json()["events"]
    kinds = [e["kind"] for e in events]
    assert "field_set" in kinds
    assert "merged" in kinds
