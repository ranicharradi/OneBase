from contextlib import contextmanager
from unittest.mock import MagicMock, patch

from app.models.match_run import MatchRun
from app.models.source import DataSource

_source_counter = 0


def _source(db):
    global _source_counter
    _source_counter += 1
    src = DataSource(
        name=f"s{_source_counter}",
        type="supplier",
        column_mapping={"name": "x"},
        identity_field_key="name",
    )
    db.add(src)
    db.flush()
    return src


def test_run_match_completes_run(test_db):
    s1 = _source(test_db)
    s2 = _source(test_db)
    run = MatchRun(type="supplier", mode="FILE_VS_FILE", status="pending", created_by="u")
    run.sources = [s1, s2]
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
        patch("app.services.record_set.RecordSet.from_source", return_value=fake_record_set),
        patch("app.services.matching.run_matching_pipeline", return_value=fake_stats),
    ):
        run_match.run(run.id)

    test_db.refresh(run)
    assert run.status == "completed"
    assert run.finished_at is not None
