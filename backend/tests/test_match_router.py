from app.models.batch import ImportBatch
from app.models.enums import BatchStatus
from app.models.match_run import MatchRun
from app.models.source import DataSource


def _seed_two_batches(db):
    src1 = DataSource(name="s1", type="supplier", column_mapping={"name": "x"})
    src2 = DataSource(name="s2", type="supplier", column_mapping={"name": "x"})
    db.add_all([src1, src2])
    db.flush()
    b1 = ImportBatch(data_source_id=src1.id, filename="a", uploaded_by="u", status=BatchStatus.COMPLETED)
    b2 = ImportBatch(data_source_id=src2.id, filename="b", uploaded_by="u", status=BatchStatus.COMPLETED)
    db.add_all([b1, b2])
    db.commit()
    return b1, b2


def test_post_creates_run_and_dispatches(authenticated_client, test_db, monkeypatch):
    b1, b2 = _seed_two_batches(test_db)

    captured = {}

    class _FakeTask:
        id = "fake-task-id"

    def fake_delay(run_id):
        captured["run_id"] = run_id
        return _FakeTask()

    monkeypatch.setattr("app.routers.matches.run_match.delay", fake_delay)

    resp = authenticated_client.post(
        "/api/matches/",
        json={"type": "supplier", "mode": "FILE_VS_FILE", "batch_ids": [b1.id, b2.id]},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["status"] == "pending"
    assert body["task_id"] == "fake-task-id"
    assert captured["run_id"] == body["id"]


def test_post_returns_409_when_run_already_active(authenticated_client, test_db):
    b1, b2 = _seed_two_batches(test_db)
    existing = MatchRun(type="supplier", mode="FILE_VS_FILE", status="running", created_by="u")
    test_db.add(existing)
    test_db.commit()

    resp = authenticated_client.post(
        "/api/matches/",
        json={"type": "supplier", "mode": "FILE_VS_FILE", "batch_ids": [b1.id, b2.id]},
    )
    assert resp.status_code == 409


def test_list_runs_returns_empty_initially(authenticated_client, test_db):
    resp = authenticated_client.get("/api/matches/")
    assert resp.status_code == 200
    assert resp.json() == []


def test_get_run_returns_detail(authenticated_client, test_db):
    b1, b2 = _seed_two_batches(test_db)
    run = MatchRun(type="supplier", mode="FILE_VS_FILE", status="pending", created_by="u")
    run.batches = [b1, b2]
    test_db.add(run)
    test_db.commit()

    resp = authenticated_client.get(f"/api/matches/{run.id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == run.id
    assert "candidate_counts" in body


def test_get_run_returns_404_for_missing(authenticated_client, test_db):
    resp = authenticated_client.get("/api/matches/99999")
    assert resp.status_code == 404


def test_delete_run_returns_204_for_pending(authenticated_client, test_db):
    run = MatchRun(type="supplier", mode="FILE_VS_FILE", status="pending", created_by="u")
    test_db.add(run)
    test_db.commit()

    resp = authenticated_client.delete(f"/api/matches/{run.id}")
    assert resp.status_code == 204


def test_delete_run_returns_409_for_running(authenticated_client, test_db):
    run = MatchRun(type="supplier", mode="FILE_VS_FILE", status="running", created_by="u")
    test_db.add(run)
    test_db.commit()

    resp = authenticated_client.delete(f"/api/matches/{run.id}")
    assert resp.status_code == 409
