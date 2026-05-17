import pytest

from app.models.batch import ImportBatch
from app.models.enums import BatchStatus
from app.models.match_run import MatchRun
from app.models.source import DataSource
from app.services.match import (
    MatchConflictError,
    MatchValidationError,
    create_run,
    mark_stale_for_source,
)


def _batch(db, type_key="supplier", name="src"):
    src = DataSource(name=name, type=type_key, column_mapping={"name": "x"})
    db.add(src)
    db.flush()
    batch = ImportBatch(data_source_id=src.id, filename="f", uploaded_by="u", status=BatchStatus.COMPLETED)
    db.add(batch)
    db.flush()
    return batch


def test_create_run_file_vs_file_requires_two_batches(test_db):
    b1 = _batch(test_db)
    with pytest.raises(MatchValidationError, match="requires 2 batches"):
        create_run(test_db, type="supplier", mode="FILE_VS_FILE", batch_ids=[b1.id], name=None, username="u")


def test_create_run_rejects_cross_type(test_db):
    b1 = _batch(test_db, type_key="supplier", name="a")
    b2 = _batch(test_db, type_key="client", name="b")
    with pytest.raises(MatchValidationError, match="must all be of type"):
        create_run(test_db, type="supplier", mode="FILE_VS_FILE", batch_ids=[b1.id, b2.id], name=None, username="u")


def test_create_run_file_vs_golden_requires_unified_records(test_db):
    b1 = _batch(test_db)
    with pytest.raises(MatchValidationError, match="No golden records"):
        create_run(test_db, type="supplier", mode="FILE_VS_GOLDEN", batch_ids=[b1.id], name=None, username="u")


def test_create_run_conflicts_with_running_run_same_type(test_db):
    b1 = _batch(test_db, name="a")
    b2 = _batch(test_db, name="b")
    existing = MatchRun(type="supplier", mode="FILE_VS_FILE", status="running", created_by="u")
    test_db.add(existing)
    test_db.commit()
    with pytest.raises(MatchConflictError) as exc:
        create_run(test_db, type="supplier", mode="FILE_VS_FILE", batch_ids=[b1.id, b2.id], name=None, username="u")
    assert exc.value.run_id == existing.id


def test_create_run_happy_path_returns_pending(test_db):
    b1 = _batch(test_db, name="a")
    b2 = _batch(test_db, name="b")
    run = create_run(test_db, type="supplier", mode="FILE_VS_FILE", batch_ids=[b1.id, b2.id], name="aug", username="u")
    test_db.commit()
    assert run.status == "pending"
    assert run.mode == "FILE_VS_FILE"
    assert {b.id for b in run.batches} == {b1.id, b2.id}


def test_mark_stale_for_source_marks_referencing_runs(test_db):
    b = _batch(test_db, name="a")
    other = _batch(test_db, name="b")
    run = MatchRun(type="supplier", mode="FILE_VS_FILE", status="completed", created_by="u")
    run.batches = [b, other]
    test_db.add(run)
    test_db.commit()
    n = mark_stale_for_source(test_db, b.data_source_id)
    test_db.commit()
    test_db.refresh(run)
    assert n == 1
    assert run.status == "stale"
