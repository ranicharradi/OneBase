from app.models.batch import ImportBatch
from app.models.enums import BatchStatus
from app.models.match_run import MatchRun
from app.models.source import DataSource
from app.models.unified import UnifiedRecord

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_source(db, name, type_="supplier"):
    src = DataSource(name=name, type=type_, column_mapping={"name": "x"}, identity_field_key="name")
    db.add(src)
    db.flush()
    return src


def _make_batch(db, source, filename):
    b = ImportBatch(
        data_source_id=source.id,
        filename=filename,
        original_filename=filename,
        file_extension=".csv",
        uploaded_by="u",
        status=BatchStatus.COMPLETED,
    )
    db.add(b)
    db.flush()
    return b


def _seed_two_batches(db):
    """Returns (src1, b1, src2, b2) so callers can use either source or batch ids."""
    src1 = _make_source(db, "s1")
    src2 = _make_source(db, "s2")
    b1 = _make_batch(db, src1, "a.csv")
    b2 = _make_batch(db, src2, "b.csv")
    db.commit()
    return src1, b1, src2, b2


def _completed_batch(db, type_="supplier", name=None, filename=None):
    """Returns (source_id, batch_id)."""
    n = name or f"src-{type_}-auto"
    fn = filename or f"{n}.csv"
    src = _make_source(db, n, type_=type_)
    b = _make_batch(db, src, fn)
    db.commit()
    return src.id, b.id


def _two_completed_batches(db, type_="supplier"):
    """Returns (src1_id, b1_id, src2_id, b2_id)."""
    src1 = _make_source(db, f"src-{type_}-1", type_=type_)
    src2 = _make_source(db, f"src-{type_}-2", type_=type_)
    b1 = _make_batch(db, src1, f"{type_}-a.csv")
    b2 = _make_batch(db, src2, f"{type_}-b.csv")
    db.commit()
    return src1.id, b1.id, src2.id, b2.id


def _three_completed_batches(db, type_="supplier"):
    """Returns (src1_id, b1_id, src2_id, b2_id, src3_id, b3_id)."""
    src1 = _make_source(db, f"src-{type_}-1", type_=type_)
    src2 = _make_source(db, f"src-{type_}-2", type_=type_)
    src3 = _make_source(db, f"src-{type_}-3", type_=type_)
    b1 = _make_batch(db, src1, f"{type_}-a.csv")
    b2 = _make_batch(db, src2, f"{type_}-b.csv")
    b3 = _make_batch(db, src3, f"{type_}-c.csv")
    db.commit()
    return src1.id, b1.id, src2.id, b2.id, src3.id, b3.id


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
    src_id, batch_id = _completed_batch(test_db, type_="supplier", name="src-golden-1", filename="golden-1.csv")
    _seed_unified_record(test_db, type_="supplier")

    class _FakeTask:
        id = "fake-task-id"

    monkeypatch.setattr("app.routers.matches.run_match.delay", lambda run_id: _FakeTask())

    r = authenticated_client.post("/api/matches", json={"type": "supplier", "source_ids": [src_id]})
    assert r.status_code == 201, r.text
    runs = r.json()["runs"]
    assert len(runs) == 1
    assert runs[0]["mode"] == "FILE_VS_GOLDEN"
    assert runs[0]["sources"][0]["id"] == src_id


def test_post_matches_one_file_without_golden_returns_400(authenticated_client, test_db, monkeypatch):
    src_id, _batch_id = _completed_batch(test_db, type_="supplier", name="src-nogolden", filename="nogolden.csv")
    # no UnifiedRecord seeded

    class _FakeTask:
        id = "fake-task-id"

    monkeypatch.setattr("app.routers.matches.run_match.delay", lambda run_id: _FakeTask())

    r = authenticated_client.post("/api/matches", json={"type": "supplier", "source_ids": [src_id]})
    assert r.status_code == 400, r.text


def test_post_matches_two_files_creates_one_pairwise_run(authenticated_client, test_db, monkeypatch):
    sa, ba, sb, bb = _two_completed_batches(test_db, type_="supplier")

    class _FakeTask:
        id = "fake-task-id"

    monkeypatch.setattr("app.routers.matches.run_match.delay", lambda run_id: _FakeTask())

    r = authenticated_client.post("/api/matches", json={"type": "supplier", "source_ids": [sa, sb]})
    assert r.status_code == 201, r.text
    runs = r.json()["runs"]
    assert len(runs) == 1
    assert runs[0]["mode"] == "FILE_VS_FILE"
    assert sorted(s["id"] for s in runs[0]["sources"]) == sorted([sa, sb])


def test_post_matches_three_files_creates_three_pairwise_runs(authenticated_client, test_db, monkeypatch):
    sa, ba, sb, bb, sc, bc = _three_completed_batches(test_db, type_="supplier")

    class _FakeTask:
        id = "fake-task-id"

    monkeypatch.setattr("app.routers.matches.run_match.delay", lambda run_id: _FakeTask())

    r = authenticated_client.post("/api/matches", json={"type": "supplier", "source_ids": [sa, sb, sc]})
    assert r.status_code == 201, r.text
    runs = r.json()["runs"]
    assert len(runs) == 3
    pairs = sorted(tuple(sorted(s["id"] for s in run["sources"])) for run in runs)
    assert pairs == sorted([(sa, sb), (sa, sc), (sb, sc)])
    assert all(run["mode"] == "FILE_VS_FILE" for run in runs)


def test_post_matches_rejects_mixed_types(authenticated_client, test_db, monkeypatch):
    sa, _ba = _completed_batch(test_db, type_="supplier", name="src-mixed-s", filename="mixed-s.csv")
    sb, _bb = _completed_batch(test_db, type_="bank", name="src-mixed-b", filename="mixed-b.csv")

    class _FakeTask:
        id = "fake-task-id"

    monkeypatch.setattr("app.routers.matches.run_match.delay", lambda run_id: _FakeTask())

    r = authenticated_client.post("/api/matches", json={"type": "supplier", "source_ids": [sa, sb]})
    assert r.status_code == 400, r.text


def test_post_matches_rejects_more_than_20_files(authenticated_client, test_db):
    """POST with 21+ source_ids returns 422 (validation error)."""
    source_ids = list(range(1, 22))
    r = authenticated_client.post("/api/matches", json={"type": "supplier", "source_ids": source_ids})
    assert r.status_code == 422, r.text


def test_post_matches_dispatches_and_sets_task_id(authenticated_client, test_db, monkeypatch):
    """Verify task_id is set on returned runs."""
    sa, _ba, sb, _bb = _two_completed_batches(test_db, type_="supplier")
    captured = []

    class _FakeTask:
        id = "fake-task-abc"

    def fake_delay(run_id):
        captured.append(run_id)
        return _FakeTask()

    monkeypatch.setattr("app.routers.matches.run_match.delay", fake_delay)

    r = authenticated_client.post("/api/matches", json={"type": "supplier", "source_ids": [sa, sb]})
    assert r.status_code == 201, r.text
    runs = r.json()["runs"]
    assert runs[0]["task_id"] == "fake-task-abc"
    assert len(captured) == 1


# ---------------------------------------------------------------------------
# Existing tests (updated to new contract)
# ---------------------------------------------------------------------------


def test_post_creates_run_and_dispatches(authenticated_client, test_db, monkeypatch):
    src1, b1, src2, b2 = _seed_two_batches(test_db)

    captured = {}

    class _FakeTask:
        id = "fake-task-id"

    def fake_delay(run_id):
        captured["run_id"] = run_id
        return _FakeTask()

    monkeypatch.setattr("app.routers.matches.run_match.delay", fake_delay)

    resp = authenticated_client.post(
        "/api/matches",
        json={"type": "supplier", "source_ids": [src1.id, src2.id]},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    runs = body["runs"]
    assert len(runs) == 1
    assert runs[0]["status"] == "pending"
    assert runs[0]["task_id"] == "fake-task-id"
    assert captured["run_id"] == runs[0]["id"]


def test_post_returns_409_when_run_already_active(authenticated_client, test_db, monkeypatch):
    src1, _b1, src2, _b2 = _seed_two_batches(test_db)
    existing = MatchRun(type="supplier", mode="FILE_VS_FILE", status="running", created_by="u")
    test_db.add(existing)
    test_db.commit()

    class _FakeTask:
        id = "fake-task-id"

    monkeypatch.setattr("app.routers.matches.run_match.delay", lambda run_id: _FakeTask())

    resp = authenticated_client.post(
        "/api/matches",
        json={"type": "supplier", "source_ids": [src1.id, src2.id]},
    )
    assert resp.status_code == 409


def test_list_runs_returns_empty_initially(authenticated_client, test_db):
    resp = authenticated_client.get("/api/matches")
    assert resp.status_code == 200
    assert resp.json() == []


def test_get_run_returns_detail(authenticated_client, test_db):
    src1, _b1, src2, _b2 = _seed_two_batches(test_db)
    run = MatchRun(type="supplier", mode="FILE_VS_FILE", status="pending", created_by="u")
    run.sources = [src1, src2]
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


def test_post_matches_accepts_source_ids(authenticated_client, test_db, monkeypatch):
    """POST /api/matches accepts source_ids and resolves to each source's latest completed batch."""
    from app.models.batch import ImportBatch
    from app.models.enums import BatchStatus, RecordStatus
    from app.models.source import DataSource
    from app.models.staging import StagedRecord

    def _seed(name):
        src = DataSource(
            name=name,
            type="supplier",
            delimiter=";",
            column_mapping={"supplier_name": "Name"},
            identity_field_key="supplier_name",
        )
        test_db.add(src)
        test_db.flush()
        batch = ImportBatch(
            data_source_id=src.id,
            filename=f"u_{name}.csv",
            original_filename=f"{name}.csv",
            file_extension=".csv",
            uploaded_by="x",
            status=BatchStatus.COMPLETED,
        )
        test_db.add(batch)
        test_db.flush()
        test_db.add(
            StagedRecord(
                import_batch_id=batch.id,
                data_source_id=src.id,
                type="supplier",
                name="Acme",
                normalized_name="ACME",
                fields={"supplier_name": "Acme"},
                raw_data={"Name": "Acme"},
                status=RecordStatus.ACTIVE,
            )
        )
        return src, batch

    class _FakeTask:
        id = "fake-task-id"

    monkeypatch.setattr("app.routers.matches.run_match.delay", lambda run_id: _FakeTask())

    s1, _b1 = _seed("Industry A")
    s2, _b2 = _seed("Industry B")
    test_db.commit()

    r = authenticated_client.post(
        "/api/matches",
        json={"type": "supplier", "source_ids": [s1.id, s2.id]},
    )
    assert r.status_code == 201
    runs = r.json()["runs"]
    assert len(runs) == 1
    assert sorted(s["id"] for s in runs[0]["sources"]) == sorted([s1.id, s2.id])
    source_names = sorted(s["name"] for s in runs[0]["sources"])
    assert source_names == ["Industry A", "Industry B"]


def test_match_run_response_has_sources(authenticated_client, test_db):
    """MatchRunResponse carries sources with id and name."""
    from app.models.match_run import MatchRun
    from app.models.source import DataSource

    src = DataSource(
        name="Industry A",
        type="supplier",
        delimiter=";",
        column_mapping={"supplier_name": "Name"},
        identity_field_key="supplier_name",
    )
    test_db.add(src)
    test_db.flush()
    run = MatchRun(
        type="supplier",
        mode="FILE_VS_GOLDEN",
        status="completed",
        name="Industry A × Golden",
        created_by="x",
    )
    run.sources = [src]
    test_db.add(run)
    test_db.commit()

    r = authenticated_client.get(f"/api/matches/{run.id}")
    body = r.json()
    assert len(body["sources"]) == 1
    ss = body["sources"][0]
    assert ss["id"] == src.id
    assert ss["name"] == "Industry A"
