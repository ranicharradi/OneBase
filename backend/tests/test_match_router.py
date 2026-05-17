from app.models.batch import ImportBatch
from app.models.enums import BatchStatus
from app.models.match_run import MatchRun
from app.models.source import DataSource
from app.models.unified import UnifiedRecord

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_source(db, name, type_="supplier"):
    src = DataSource(name=name, type=type_, column_mapping={"name": "x"})
    db.add(src)
    db.flush()
    return src


def _make_batch(db, source, filename):
    b = ImportBatch(data_source_id=source.id, filename=filename, uploaded_by="u", status=BatchStatus.COMPLETED)
    db.add(b)
    db.flush()
    return b


def _seed_two_batches(db):
    src1 = _make_source(db, "s1")
    src2 = _make_source(db, "s2")
    b1 = _make_batch(db, src1, "a.csv")
    b2 = _make_batch(db, src2, "b.csv")
    db.commit()
    return b1, b2


def _completed_batch_id(db, type_="supplier", name=None, filename=None):
    n = name or f"src-{type_}-auto"
    fn = filename or f"{n}.csv"
    src = _make_source(db, n, type_=type_)
    b = _make_batch(db, src, fn)
    db.commit()
    return b.id


def _two_completed_batches(db, type_="supplier"):
    src1 = _make_source(db, f"src-{type_}-1", type_=type_)
    src2 = _make_source(db, f"src-{type_}-2", type_=type_)
    b1 = _make_batch(db, src1, f"{type_}-a.csv")
    b2 = _make_batch(db, src2, f"{type_}-b.csv")
    db.commit()
    return b1.id, b2.id


def _three_completed_batches(db, type_="supplier"):
    src1 = _make_source(db, f"src-{type_}-1", type_=type_)
    src2 = _make_source(db, f"src-{type_}-2", type_=type_)
    src3 = _make_source(db, f"src-{type_}-3", type_=type_)
    b1 = _make_batch(db, src1, f"{type_}-a.csv")
    b2 = _make_batch(db, src2, f"{type_}-b.csv")
    b3 = _make_batch(db, src3, f"{type_}-c.csv")
    db.commit()
    return b1.id, b2.id, b3.id


def _seed_unified_record(db, type_="supplier"):
    ur = UnifiedRecord(
        type=type_,
        name="Acme Corp",
        fields={},
        provenance={},
        source_record_ids=[],
        created_by="u",
    )
    db.add(ur)
    db.commit()
    return ur


# ---------------------------------------------------------------------------
# New dispatch tests
# ---------------------------------------------------------------------------


def test_post_matches_one_file_creates_vs_golden_run(authenticated_client, test_db, monkeypatch):
    """1 file + existing unified records => 1 FILE_VS_GOLDEN run."""
    file_id = _completed_batch_id(test_db, type_="supplier", name="src-golden-1", filename="golden-1.csv")
    _seed_unified_record(test_db, type_="supplier")

    class _FakeTask:
        id = "fake-task-id"

    monkeypatch.setattr("app.routers.matches.run_match.delay", lambda run_id: _FakeTask())

    r = authenticated_client.post("/api/matches", json={"type": "supplier", "file_ids": [file_id]})
    assert r.status_code == 201, r.text
    runs = r.json()["runs"]
    assert len(runs) == 1
    assert runs[0]["mode"] == "FILE_VS_GOLDEN"
    assert runs[0]["batch_ids"] == [file_id]


def test_post_matches_one_file_without_golden_returns_400(authenticated_client, test_db, monkeypatch):
    file_id = _completed_batch_id(test_db, type_="supplier", name="src-nogolden", filename="nogolden.csv")
    # no UnifiedRecord seeded

    class _FakeTask:
        id = "fake-task-id"

    monkeypatch.setattr("app.routers.matches.run_match.delay", lambda run_id: _FakeTask())

    r = authenticated_client.post("/api/matches", json={"type": "supplier", "file_ids": [file_id]})
    assert r.status_code == 400, r.text


def test_post_matches_two_files_creates_one_pairwise_run(authenticated_client, test_db, monkeypatch):
    a, b = _two_completed_batches(test_db, type_="supplier")

    class _FakeTask:
        id = "fake-task-id"

    monkeypatch.setattr("app.routers.matches.run_match.delay", lambda run_id: _FakeTask())

    r = authenticated_client.post("/api/matches", json={"type": "supplier", "file_ids": [a, b]})
    assert r.status_code == 201, r.text
    runs = r.json()["runs"]
    assert len(runs) == 1
    assert runs[0]["mode"] == "FILE_VS_FILE"
    assert sorted(runs[0]["batch_ids"]) == sorted([a, b])


def test_post_matches_three_files_creates_three_pairwise_runs(authenticated_client, test_db, monkeypatch):
    a, b, c = _three_completed_batches(test_db, type_="supplier")

    class _FakeTask:
        id = "fake-task-id"

    monkeypatch.setattr("app.routers.matches.run_match.delay", lambda run_id: _FakeTask())

    r = authenticated_client.post("/api/matches", json={"type": "supplier", "file_ids": [a, b, c]})
    assert r.status_code == 201, r.text
    runs = r.json()["runs"]
    assert len(runs) == 3
    pairs = sorted(tuple(sorted(run["batch_ids"])) for run in runs)
    assert pairs == sorted([(a, b), (a, c), (b, c)])
    assert all(run["mode"] == "FILE_VS_FILE" for run in runs)


def test_post_matches_rejects_mixed_types(authenticated_client, test_db, monkeypatch):
    a = _completed_batch_id(test_db, type_="supplier", name="src-mixed-s", filename="mixed-s.csv")
    b = _completed_batch_id(test_db, type_="bank", name="src-mixed-b", filename="mixed-b.csv")

    class _FakeTask:
        id = "fake-task-id"

    monkeypatch.setattr("app.routers.matches.run_match.delay", lambda run_id: _FakeTask())

    r = authenticated_client.post("/api/matches", json={"type": "supplier", "file_ids": [a, b]})
    assert r.status_code == 400, r.text


def test_post_matches_rejects_more_than_20_files(authenticated_client, test_db):
    """POST with 21+ file_ids returns 422 (validation error)."""
    file_ids = list(range(1, 22))
    r = authenticated_client.post("/api/matches", json={"type": "supplier", "file_ids": file_ids})
    assert r.status_code == 422, r.text


def test_post_matches_dispatches_and_sets_task_id(authenticated_client, test_db, monkeypatch):
    """Verify task_id is set on returned runs."""
    a, b = _two_completed_batches(test_db, type_="supplier")
    captured = []

    class _FakeTask:
        id = "fake-task-abc"

    def fake_delay(run_id):
        captured.append(run_id)
        return _FakeTask()

    monkeypatch.setattr("app.routers.matches.run_match.delay", fake_delay)

    r = authenticated_client.post("/api/matches", json={"type": "supplier", "file_ids": [a, b]})
    assert r.status_code == 201, r.text
    runs = r.json()["runs"]
    assert runs[0]["task_id"] == "fake-task-abc"
    assert len(captured) == 1


# ---------------------------------------------------------------------------
# Existing tests (updated to new contract)
# ---------------------------------------------------------------------------


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
        "/api/matches",
        json={"type": "supplier", "file_ids": [b1.id, b2.id]},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    runs = body["runs"]
    assert len(runs) == 1
    assert runs[0]["status"] == "pending"
    assert runs[0]["task_id"] == "fake-task-id"
    assert captured["run_id"] == runs[0]["id"]


def test_post_returns_409_when_run_already_active(authenticated_client, test_db, monkeypatch):
    b1, b2 = _seed_two_batches(test_db)
    existing = MatchRun(type="supplier", mode="FILE_VS_FILE", status="running", created_by="u")
    test_db.add(existing)
    test_db.commit()

    class _FakeTask:
        id = "fake-task-id"

    monkeypatch.setattr("app.routers.matches.run_match.delay", lambda run_id: _FakeTask())

    resp = authenticated_client.post(
        "/api/matches",
        json={"type": "supplier", "file_ids": [b1.id, b2.id]},
    )
    assert resp.status_code == 409


def test_list_runs_returns_empty_initially(authenticated_client, test_db):
    resp = authenticated_client.get("/api/matches")
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
