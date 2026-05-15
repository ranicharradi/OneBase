"""Tests for merge service and review API endpoints."""

import pytest
from sqlalchemy.orm import Session

from app.models.batch import ImportBatch
from app.models.comparison import ComparisonRun
from app.models.enums import BatchStatus, CandidateStatus, RecordStatus
from app.models.match import MatchCandidate
from app.models.source import DataSource
from app.models.staging import StagedRecord
from app.models.unified import UnifiedRecord
from app.services.merge import compare_fields, execute_merge, reject_candidate

# ── Helpers ──


def _make_source(db: Session, name: str) -> DataSource:
    src = DataSource(name=name, type="supplier", file_format="csv", column_mapping={"name": "N"})
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


def _make_record(
    db: Session,
    batch: ImportBatch,
    source: DataSource,
    name: str,
    short_name: str | None = None,
    currency: str | None = None,
    contact_name: str | None = None,
) -> StagedRecord:
    fields: dict = {"supplier_name": name}
    if short_name is not None:
        fields["short_name"] = short_name
    if currency is not None:
        fields["currency"] = currency
    if contact_name is not None:
        fields["contact_name"] = contact_name

    s = StagedRecord(
        type="supplier",
        import_batch_id=batch.id,
        data_source_id=source.id,
        name=name,
        normalized_name=name.upper(),
        raw_data={"name": name},
        status=RecordStatus.ACTIVE,
        fields=fields,
    )
    db.add(s)
    db.flush()
    return s


def _make_run(db: Session) -> ComparisonRun:
    run = ComparisonRun(type="supplier", mode="FILE_VS_FILE", status="pending", created_by="u")
    db.add(run)
    db.flush()
    return run


def _make_candidate(db: Session, rec_a: StagedRecord, rec_b: StagedRecord, confidence: float = 0.9) -> MatchCandidate:
    run = _make_run(db)
    c = MatchCandidate(
        type="supplier",
        comparison_run_id=run.id,
        record_a_id=rec_a.id,
        record_b_id=rec_b.id,
        confidence=confidence,
        match_signals={
            "jaro_winkler:supplier_name": 0.95,
            "token_jaccard:supplier_name": 0.8,
            "embedding_cosine:supplier_name": 0.85,
            "jaro_winkler:short_name": 0.5,
            "exact_ci:currency": 1.0,
            "jaro_winkler:contact_name": 0.0,
        },
        status=CandidateStatus.PENDING,
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

    rec_a = _make_record(
        db,
        batch_eot,
        src_eot,
        name="ACME CORP",
        short_name="ACME",
        currency="EUR",
        contact_name="John Doe",
    )
    rec_b = _make_record(
        db,
        batch_ttei,
        src_ttei,
        name="ACME CORPORATION",
        short_name="ACME",
        currency="USD",
    )

    candidate = _make_candidate(db, rec_a, rec_b)
    db.commit()

    return rec_a, rec_b, candidate, src_eot, src_ttei


# ── compare_fields tests ──


class TestCompareFields:
    def test_identical_field_detection(self, test_db):
        """Identical values across sources are flagged as identical."""
        rec_a, rec_b, _, _, _ = _setup_pair(test_db)

        comparisons = compare_fields(rec_a, rec_b, "EOT", "TTEI")
        short_name = next(c for c in comparisons if c["field"] == "short_name")

        assert short_name["is_identical"] is True
        assert short_name["is_conflict"] is False
        assert short_name["value_a"] == "ACME"
        assert short_name["value_b"] == "ACME"

    def test_conflict_detection(self, test_db):
        """Different values for same field are flagged as conflict."""
        rec_a, rec_b, _, _, _ = _setup_pair(test_db)

        comparisons = compare_fields(rec_a, rec_b, "EOT", "TTEI")
        name_comp = next(c for c in comparisons if c["field"] == "supplier_name")

        assert name_comp["is_conflict"] is True
        assert name_comp["value_a"] == "ACME CORP"
        assert name_comp["value_b"] == "ACME CORPORATION"

    def test_source_only_detection(self, test_db):
        """Value present in only one source is flagged as source-only."""
        rec_a, rec_b, _, _, _ = _setup_pair(test_db)

        comparisons = compare_fields(rec_a, rec_b, "EOT", "TTEI")
        contact = next(c for c in comparisons if c["field"] == "contact_name")

        assert contact["is_a_only"] is True
        assert contact["value_a"] == "John Doe"
        assert contact["value_b"] is None

    def test_currency_conflict(self, test_db):
        """Different currencies are flagged as conflict."""
        rec_a, rec_b, _, _, _ = _setup_pair(test_db)

        comparisons = compare_fields(rec_a, rec_b, "EOT", "TTEI")
        currency = next(c for c in comparisons if c["field"] == "currency")

        assert currency["is_conflict"] is True
        assert currency["value_a"] == "EUR"
        assert currency["value_b"] == "USD"


# ── execute_merge tests ──


class TestExecuteMerge:
    def test_merge_with_field_selections(self, test_db):
        """Merge resolves conflicts via user selections, auto-includes rest."""
        rec_a, rec_b, candidate, _, _ = _setup_pair(test_db)

        selections = [
            {"field": "supplier_name", "chosen_record_id": rec_a.id},
            {"field": "currency", "chosen_record_id": rec_b.id},
        ]

        unified = execute_merge(
            db=test_db,
            candidate=candidate,
            record_a=rec_a,
            record_b=rec_b,
            source_a_name="EOT",
            source_b_name="TTEI",
            field_selections=selections,
            username="testuser",
        )
        test_db.commit()

        assert unified.name == "ACME CORP"  # chosen from A (supplier_name)
        assert unified.fields.get("currency") == "USD"  # chosen from B
        assert unified.fields.get("short_name") == "ACME"  # identical — auto
        assert unified.fields.get("contact_name") == "John Doe"  # A-only — auto

        # Provenance
        assert unified.provenance["supplier_name"]["auto"] is False
        assert unified.provenance["short_name"]["auto"] is True
        assert unified.provenance["contact_name"]["auto"] is True
        assert unified.provenance["contact_name"]["source_entity"] == "EOT"

        # Candidate marked merged
        assert candidate.status == CandidateStatus.MERGED
        assert candidate.reviewed_by == "testuser"

    def test_merge_missing_conflict_selection_raises(self, test_db):
        """Merge fails if a conflicting field has no selection."""
        rec_a, rec_b, candidate, _, _ = _setup_pair(test_db)

        with pytest.raises(ValueError, match="Missing field selection"):
            execute_merge(
                db=test_db,
                candidate=candidate,
                record_a=rec_a,
                record_b=rec_b,
                source_a_name="EOT",
                source_b_name="TTEI",
                field_selections=[],  # Missing selections for supplier_name, currency
                username="testuser",
            )

    def test_merge_records_source_record_ids(self, test_db):
        """Unified record tracks which staged records were merged."""
        rec_a, rec_b, candidate, _, _ = _setup_pair(test_db)

        selections = [
            {"field": "supplier_name", "chosen_record_id": rec_a.id},
            {"field": "currency", "chosen_record_id": rec_a.id},
        ]

        unified = execute_merge(
            db=test_db,
            candidate=candidate,
            record_a=rec_a,
            record_b=rec_b,
            source_a_name="EOT",
            source_b_name="TTEI",
            field_selections=selections,
            username="testuser",
        )
        test_db.commit()

        assert set(unified.source_record_ids) == {rec_a.id, rec_b.id}


# ── reject tests ──


class TestReject:
    def test_reject_candidate(self, test_db):
        rec_a, rec_b, candidate, _, _ = _setup_pair(test_db)

        reject_candidate(test_db, candidate, "reviewer1")
        test_db.commit()

        assert candidate.status == CandidateStatus.REJECTED
        assert candidate.reviewed_by == "reviewer1"


# ── API endpoint tests ──


class TestReviewAPI:
    def _setup_data(self, db):
        """Set up test data and return record IDs for assertions."""
        src_eot = _make_source(db, "EOT")
        src_ttei = _make_source(db, "TTEI")
        batch_eot = _make_batch(db, src_eot)
        batch_ttei = _make_batch(db, src_ttei)

        rec_a = _make_record(
            db,
            batch_eot,
            src_eot,
            "ACME CORP",
            short_name="ACME",
            currency="EUR",
        )
        rec_b = _make_record(
            db,
            batch_ttei,
            src_ttei,
            "ACME CORPORATION",
            short_name="ACME",
            currency="USD",
        )
        candidate = _make_candidate(db, rec_a, rec_b)
        db.commit()
        return rec_a, rec_b, candidate

    def test_review_queue(self, authenticated_client, test_db):
        rec_a, rec_b, candidate = self._setup_data(test_db)

        resp = authenticated_client.get("/api/review/queue")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["id"] == candidate.id
        assert data["items"][0]["record_a_name"] == "ACME CORP"

    def test_match_detail(self, authenticated_client, test_db):
        rec_a, rec_b, candidate = self._setup_data(test_db)

        resp = authenticated_client.get(f"/api/review/candidates/{candidate.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["record_a"]["name"] == "ACME CORP"
        assert data["record_b"]["name"] == "ACME CORPORATION"
        assert len(data["field_comparisons"]) == 4  # all canonical fields

        # Check conflict detection
        name_comp = next(c for c in data["field_comparisons"] if c["field"] == "supplier_name")
        assert name_comp["is_conflict"] is True

    def test_merge_endpoint(self, authenticated_client, test_db):
        rec_a, rec_b, candidate = self._setup_data(test_db)

        # Confirm first (new two-step flow: pending → confirmed → merged)
        confirm_resp = authenticated_client.post(f"/api/review/candidates/{candidate.id}/confirm")
        assert confirm_resp.status_code == 200

        resp = authenticated_client.post(
            f"/api/review/candidates/{candidate.id}/merge",
            json={
                "field_selections": [
                    {"field": "supplier_name", "chosen_record_id": rec_a.id},
                    {"field": "currency", "chosen_record_id": rec_a.id},
                ]
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["action"] == "merged"
        assert data["unified_record_id"] is not None

        # Verify unified record was created
        unified = test_db.query(UnifiedRecord).first()
        assert unified is not None
        assert unified.name == "ACME CORP"

    def test_reject_endpoint(self, authenticated_client, test_db):
        _, _, candidate = self._setup_data(test_db)

        resp = authenticated_client.post(f"/api/review/candidates/{candidate.id}/reject")
        assert resp.status_code == 200
        assert resp.json()["action"] == "rejected"

    def test_cannot_merge_already_rejected(self, authenticated_client, test_db):
        rec_a, rec_b, candidate = self._setup_data(test_db)

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


def test_merge_expands_group_members(test_db):
    """Merging grouped reps includes all group members in source_record_ids."""
    src1 = _make_source(test_db, "TTEI")
    src2 = _make_source(test_db, "EOT")
    batch1 = _make_batch(test_db, src1)
    batch2 = _make_batch(test_db, src2)

    # src1: 3 rows grouped under s1a as representative
    s1a = _make_record(test_db, batch1, src1, "Acme Corp", currency="TND")
    s1b = _make_record(test_db, batch1, src1, "Acme Corp")
    s1c = _make_record(test_db, batch1, src1, "Acme Corp")
    s1a.intra_source_group_id = s1a.id
    s1b.intra_source_group_id = s1a.id
    s1c.intra_source_group_id = s1a.id

    # src2: single ungrouped row — same name so no conflict in merge
    s2 = _make_record(test_db, batch2, src2, "Acme Corp", currency="TND")
    test_db.flush()

    candidate = _make_candidate(test_db, s1a, s2)
    test_db.flush()

    unified = execute_merge(
        db=test_db,
        candidate=candidate,
        record_a=s1a,
        record_b=s2,
        source_a_name="TTEI",
        source_b_name="EOT",
        field_selections=[],
        username="reviewer",
    )
    test_db.flush()

    # source_record_ids should include all 3 TTEI members + EOT row
    assert set(unified.source_record_ids) == {s1a.id, s1b.id, s1c.id, s2.id}


def test_merge_ungrouped_backward_compat(test_db):
    """Merging ungrouped records keeps source_record_ids as [a, b]."""
    src1 = _make_source(test_db, "TTEI")
    src2 = _make_source(test_db, "EOT")
    batch1 = _make_batch(test_db, src1)
    batch2 = _make_batch(test_db, src2)

    # Both ungrouped (intra_source_group_id is None) — same name so no conflict
    s1 = _make_record(test_db, batch1, src1, "Acme Corp", currency="TND")
    s2 = _make_record(test_db, batch2, src2, "Acme Corp", currency="TND")
    test_db.flush()

    candidate = _make_candidate(test_db, s1, s2)
    test_db.flush()

    unified = execute_merge(
        db=test_db,
        candidate=candidate,
        record_a=s1,
        record_b=s2,
        source_a_name="TTEI",
        source_b_name="EOT",
        field_selections=[],
        username="reviewer",
    )
    test_db.flush()

    assert set(unified.source_record_ids) == {s1.id, s2.id}


def test_execute_merge_sets_dq_score(test_db):
    """After execute_merge runs, the returned UnifiedRecord has dq_* fields populated."""
    src_a = _make_source(test_db, "A")
    src_b = _make_source(test_db, "B")
    batch_a = _make_batch(test_db, src_a)
    batch_b = _make_batch(test_db, src_b)

    rec_a = _make_record(test_db, batch_a, src_a, name="Acme Corp", currency="USD")
    rec_b = _make_record(test_db, batch_b, src_b, name="Acme Corp", currency="USD")
    test_db.flush()

    candidate = _make_candidate(test_db, rec_a, rec_b)
    test_db.flush()

    unified = execute_merge(
        db=test_db,
        candidate=candidate,
        record_a=rec_a,
        record_b=rec_b,
        source_a_name="A",
        source_b_name="B",
        field_selections=[],
        username="tester",
    )
    test_db.commit()

    assert unified.dq_score is not None
    assert 0.0 <= unified.dq_score <= 1.0
    assert unified.dq_completeness is not None
    assert unified.dq_validity is not None


def test_execute_merge_file_vs_golden_updates_existing_unified(test_db):
    db = test_db
    src = DataSource(name="src-x", type="supplier", column_mapping={"name": "Supplier Name"})
    db.add(src)
    db.flush()
    batch = ImportBatch(data_source_id=src.id, filename="f.csv", uploaded_by="u", status=BatchStatus.COMPLETED)
    db.add(batch)
    db.flush()

    staged = StagedRecord(
        type="supplier",
        import_batch_id=batch.id,
        data_source_id=src.id,
        name="ACME LTD",
        normalized_name="ACME LTD",
        status=RecordStatus.ACTIVE,
        fields={"supplier_name": "ACME LTD", "country": "FR"},
    )
    unified = UnifiedRecord(
        type="supplier",
        name="ACME CORP",
        normalized_name="ACME CORP",
        fields={"supplier_name": "ACME CORP", "country": "US"},
        provenance={
            "supplier_name": {
                "value": "ACME CORP",
                "source_entity": "old",
                "source_record_id": 999,
                "auto": True,
                "chosen_by": "u",
                "chosen_at": "2026-01-01T00:00:00Z",
            },
            "country": {
                "value": "US",
                "source_entity": "old",
                "source_record_id": 999,
                "auto": True,
                "chosen_by": "u",
                "chosen_at": "2026-01-01T00:00:00Z",
            },
        },
        source_record_ids=[999],
        created_by="u",
    )
    db.add_all([staged, unified])
    db.flush()

    run = ComparisonRun(type="supplier", mode="FILE_VS_GOLDEN", status="completed", created_by="u")
    db.add(run)
    db.flush()

    cand = MatchCandidate(
        type="supplier",
        comparison_run_id=run.id,
        record_a_id=staged.id,
        record_b_id=unified.id,
        side_a_kind="staged",
        side_b_kind="unified",
        confidence=0.95,
        match_signals={},
        status=CandidateStatus.PENDING,
    )
    db.add(cand)
    db.flush()

    unified_count_before = db.query(UnifiedRecord).count()

    # Reviewer chose the staged value for "country".
    result = execute_merge(
        db,
        candidate=cand,
        record_a=staged,
        record_b=unified,
        source_a_name="src-x",
        source_b_name="Golden",
        field_selections=[{"field": "country", "chosen_record_id": staged.id}],
        username="reviewer1",
    )
    db.flush()

    assert db.query(UnifiedRecord).count() == unified_count_before  # no new golden created
    assert result.id == unified.id
    assert staged.id in unified.source_record_ids
    assert unified.fields["country"] == "FR"
    assert unified.provenance["country"]["source_record_id"] == staged.id
    assert unified.provenance["country"]["chosen_by"] == "reviewer1"
    assert cand.status == CandidateStatus.MERGED


def test_execute_merge_file_vs_golden_adds_a_only_field(test_db):
    """Staged record has a field (vat_id) absent from the golden — it must be added."""
    db = test_db
    src = DataSource(name="src-vat", type="supplier", column_mapping={"name": "Supplier Name"})
    db.add(src)
    db.flush()
    batch = ImportBatch(data_source_id=src.id, filename="f.csv", uploaded_by="u", status=BatchStatus.COMPLETED)
    db.add(batch)
    db.flush()

    staged = StagedRecord(
        type="supplier",
        import_batch_id=batch.id,
        data_source_id=src.id,
        name="ACME LTD",
        normalized_name="ACME LTD",
        status=RecordStatus.ACTIVE,
        fields={"supplier_name": "ACME LTD", "vat_id": "FR123"},
    )
    unified = UnifiedRecord(
        type="supplier",
        name="ACME CORP",
        normalized_name="ACME CORP",
        fields={"supplier_name": "ACME CORP"},
        provenance={
            "supplier_name": {
                "value": "ACME CORP",
                "source_entity": "old",
                "source_record_id": 999,
                "auto": True,
                "chosen_by": "u",
                "chosen_at": "2026-01-01T00:00:00Z",
            },
        },
        source_record_ids=[999],
        created_by="u",
    )
    db.add_all([staged, unified])
    db.flush()

    run = ComparisonRun(type="supplier", mode="FILE_VS_GOLDEN", status="completed", created_by="u")
    db.add(run)
    db.flush()

    cand = MatchCandidate(
        type="supplier",
        comparison_run_id=run.id,
        record_a_id=staged.id,
        record_b_id=unified.id,
        side_a_kind="staged",
        side_b_kind="unified",
        confidence=0.95,
        match_signals={},
        status=CandidateStatus.PENDING,
    )
    db.add(cand)
    db.flush()

    # supplier_name conflicts; reviewer chose staged. vat_id is a-only → added automatically.
    result = execute_merge(
        db,
        candidate=cand,
        record_a=staged,
        record_b=unified,
        source_a_name="src-vat",
        source_b_name="Golden",
        field_selections=[{"field": "supplier_name", "chosen_record_id": staged.id}],
        username="reviewer1",
    )
    db.flush()

    assert result.fields["vat_id"] == "FR123"


def test_execute_merge_file_vs_golden_stringifies_extra_a_only_field(test_db):
    """Extra JSON fields keep the historical stringified merge semantics."""
    db = test_db
    src = DataSource(name="src-extra", type="supplier", column_mapping={"name": "Supplier Name"})
    db.add(src)
    db.flush()
    batch = ImportBatch(data_source_id=src.id, filename="f.csv", uploaded_by="u", status=BatchStatus.COMPLETED)
    db.add(batch)
    db.flush()

    staged = StagedRecord(
        type="supplier",
        import_batch_id=batch.id,
        data_source_id=src.id,
        name="ACME CORP",
        normalized_name="ACME CORP",
        status=RecordStatus.ACTIVE,
        fields={"supplier_name": "ACME CORP", "legacy_code": 123},
    )
    unified = UnifiedRecord(
        type="supplier",
        name="ACME CORP",
        normalized_name="ACME CORP",
        fields={"supplier_name": "ACME CORP"},
        provenance={},
        source_record_ids=[999],
        created_by="u",
    )
    db.add_all([staged, unified])
    db.flush()

    run = ComparisonRun(type="supplier", mode="FILE_VS_GOLDEN", status="completed", created_by="u")
    db.add(run)
    db.flush()

    cand = MatchCandidate(
        type="supplier",
        comparison_run_id=run.id,
        record_a_id=staged.id,
        record_b_id=unified.id,
        side_a_kind="staged",
        side_b_kind="unified",
        confidence=0.95,
        match_signals={},
        status=CandidateStatus.PENDING,
    )
    db.add(cand)
    db.flush()

    result = execute_merge(
        db,
        candidate=cand,
        record_a=staged,
        record_b=unified,
        source_a_name="src-extra",
        source_b_name="Golden",
        field_selections=[],
        username="reviewer1",
    )
    db.flush()

    assert result.fields["legacy_code"] == "123"
    assert result.provenance["legacy_code"]["value"] == "123"


def test_execute_merge_file_vs_golden_keeps_b_only_field(test_db):
    """Golden has a field (contract_type) absent from staged — it must be kept unchanged."""
    db = test_db
    src = DataSource(name="src-ct", type="supplier", column_mapping={"name": "Supplier Name"})
    db.add(src)
    db.flush()
    batch = ImportBatch(data_source_id=src.id, filename="f.csv", uploaded_by="u", status=BatchStatus.COMPLETED)
    db.add(batch)
    db.flush()

    staged = StagedRecord(
        type="supplier",
        import_batch_id=batch.id,
        data_source_id=src.id,
        name="ACME LTD",
        normalized_name="ACME LTD",
        status=RecordStatus.ACTIVE,
        fields={"supplier_name": "ACME LTD"},
    )
    unified = UnifiedRecord(
        type="supplier",
        name="ACME CORP",
        normalized_name="ACME CORP",
        fields={"supplier_name": "ACME CORP", "contract_type": "FRAMEWORK"},
        provenance={
            "supplier_name": {
                "value": "ACME CORP",
                "source_entity": "old",
                "source_record_id": 999,
                "auto": True,
                "chosen_by": "u",
                "chosen_at": "2026-01-01T00:00:00Z",
            },
            "contract_type": {
                "value": "FRAMEWORK",
                "source_entity": "old",
                "source_record_id": 999,
                "auto": True,
                "chosen_by": "u",
                "chosen_at": "2026-01-01T00:00:00Z",
            },
        },
        source_record_ids=[999],
        created_by="u",
    )
    db.add_all([staged, unified])
    db.flush()

    run = ComparisonRun(type="supplier", mode="FILE_VS_GOLDEN", status="completed", created_by="u")
    db.add(run)
    db.flush()

    cand = MatchCandidate(
        type="supplier",
        comparison_run_id=run.id,
        record_a_id=staged.id,
        record_b_id=unified.id,
        side_a_kind="staged",
        side_b_kind="unified",
        confidence=0.95,
        match_signals={},
        status=CandidateStatus.PENDING,
    )
    db.add(cand)
    db.flush()

    # supplier_name conflicts; reviewer chose staged. contract_type is b-only → kept.
    result = execute_merge(
        db,
        candidate=cand,
        record_a=staged,
        record_b=unified,
        source_a_name="src-ct",
        source_b_name="Golden",
        field_selections=[{"field": "supplier_name", "chosen_record_id": staged.id}],
        username="reviewer1",
    )
    db.flush()

    assert result.fields["contract_type"] == "FRAMEWORK"
