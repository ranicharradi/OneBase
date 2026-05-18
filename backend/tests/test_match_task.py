from contextlib import contextmanager
from unittest.mock import MagicMock, patch

from app.models.batch import ImportBatch
from app.models.enums import BatchStatus
from app.models.match_run import MatchRun
from app.models.source import DataSource

_batch_counter = 0


def _batch(db):
    global _batch_counter
    _batch_counter += 1
    src = DataSource(
        name=f"s{_batch_counter}",
        type="supplier",
        column_mapping={"name": "x"},
        identity_field_key="name",
    )
    db.add(src)
    db.flush()
    b = ImportBatch(
        data_source_id=src.id,
        filename="f.csv",
        original_filename="f.csv",
        file_extension=".csv",
        uploaded_by="u",
        status=BatchStatus.COMPLETED,
    )
    db.add(b)
    db.flush()
    return b


def test_run_match_completes_run(test_db):
    b1 = _batch(test_db)
    b2 = _batch(test_db)
    run = MatchRun(type="supplier", mode="FILE_VS_FILE", status="pending", created_by="u")
    run.batches = [b1, b2]
    test_db.add(run)
    test_db.commit()

    from app.tasks.match import run_match

    fake_stats = {"candidate_count": 0, "group_count": 0}
    fake_record_set = MagicMock()

    @contextmanager
    def _session():
        yield test_db

    with (
        patch("app.tasks.match.get_task_session", return_value=_session()),
        patch("app.services.record_set.RecordSet.from_batch", return_value=fake_record_set),
        patch("app.services.matching.run_matching_pipeline", return_value=fake_stats),
    ):
        run_match.run(run.id)

    test_db.refresh(run)
    assert run.status == "completed"
    assert run.finished_at is not None
