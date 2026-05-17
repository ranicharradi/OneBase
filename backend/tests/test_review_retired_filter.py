"""Tests for review queue's inactive-sides filter (covers RETIRED)."""

from app.models.batch import ImportBatch
from app.models.enums import BatchStatus, CandidateStatus, RecordStatus
from app.models.match import MatchCandidate
from app.models.match_run import MatchRun
from app.models.source import DataSource
from app.models.staging import StagedRecord


def _seed_pair(db, status_a, status_b):
    src = DataSource(
        name="src",
        type="supplier",
        delimiter=";",
        column_mapping={"supplier_name": "Name"},
        identity_field_key="supplier_name",
    )
    db.add(src)
    db.flush()
    batch = ImportBatch(
        data_source_id=src.id,
        filename="u.csv",
        original_filename="u.csv",
        file_extension=".csv",
        uploaded_by="testuser",
        status=BatchStatus.PENDING,
    )
    db.add(batch)
    db.flush()
    a = StagedRecord(
        import_batch_id=batch.id,
        data_source_id=src.id,
        type="supplier",
        name="A",
        normalized_name="A",
        fields={"supplier_name": "A"},
        raw_data={},
        status=status_a,
    )
    b = StagedRecord(
        import_batch_id=batch.id,
        data_source_id=src.id,
        type="supplier",
        name="B",
        normalized_name="B",
        fields={"supplier_name": "B"},
        raw_data={},
        status=status_b,
    )
    db.add_all([a, b])
    db.flush()
    run = MatchRun(
        type="supplier",
        mode="FILE_VS_FILE",
        status="completed",
        created_by="test",
    )
    db.add(run)
    db.flush()
    cand = MatchCandidate(
        type="supplier",
        match_run_id=run.id,
        record_a_id=a.id,
        record_b_id=b.id,
        confidence=0.9,
        match_signals={},
        status=CandidateStatus.PENDING,
    )
    db.add(cand)
    db.flush()
    return cand


def test_pending_queue_excludes_retired_staged_records(authenticated_client, test_db):
    cand = _seed_pair(test_db, RecordStatus.ACTIVE, RecordStatus.RETIRED)
    test_db.commit()
    response = authenticated_client.get("/api/review/queue?status=pending")
    assert response.status_code == 200
    ids = [c["id"] for c in response.json()["items"]]
    assert cand.id not in ids


def test_pending_queue_excludes_superseded_staged_records(authenticated_client, test_db):
    cand = _seed_pair(test_db, RecordStatus.ACTIVE, RecordStatus.SUPERSEDED)
    test_db.commit()
    response = authenticated_client.get("/api/review/queue?status=pending")
    assert response.status_code == 200
    ids = [c["id"] for c in response.json()["items"]]
    assert cand.id not in ids


def test_pending_queue_includes_active_pairs(authenticated_client, test_db):
    cand = _seed_pair(test_db, RecordStatus.ACTIVE, RecordStatus.ACTIVE)
    test_db.commit()
    response = authenticated_client.get("/api/review/queue?status=pending")
    assert response.status_code == 200
    ids = [c["id"] for c in response.json()["items"]]
    assert cand.id in ids
