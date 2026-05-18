import pytest

from app.models.match_run import MatchRun
from app.models.source import DataSource
from app.models.unified import UnifiedRecord
from app.services.match import (
    MatchConflictError,
    MatchNotFoundError,
    MatchValidationError,
    create_run,
)


def _make_source(db, name, type_="supplier"):
    src = DataSource(
        name=name,
        type=type_,
        delimiter=";",
        column_mapping={"supplier_name": "Name"},
        identity_field_key="supplier_name",
    )
    db.add(src)
    db.flush()
    return src


def test_create_run_file_vs_file_requires_two_sources(test_db):
    src1 = _make_source(test_db, "s1")
    test_db.commit()
    with pytest.raises(MatchValidationError, match="requires 2 sources"):
        create_run(test_db, type="supplier", mode="FILE_VS_FILE", source_ids=[src1.id], name=None, username="u")


def test_create_run_rejects_mixed_types(test_db):
    src1 = _make_source(test_db, "s1", "supplier")
    src2 = _make_source(test_db, "s2", "bank")
    test_db.commit()
    with pytest.raises(MatchValidationError, match="must all be of type"):
        create_run(
            test_db, type="supplier", mode="FILE_VS_FILE", source_ids=[src1.id, src2.id], name=None, username="u"
        )


def test_create_run_rejects_missing_source(test_db):
    src1 = _make_source(test_db, "s1")
    test_db.commit()
    with pytest.raises(MatchValidationError, match="not found"):
        create_run(test_db, type="supplier", mode="FILE_VS_FILE", source_ids=[src1.id, 999999], name=None, username="u")


def test_create_run_file_vs_golden_requires_unified_records(test_db):
    src1 = _make_source(test_db, "s1")
    test_db.commit()
    with pytest.raises(MatchValidationError, match="No golden records"):
        create_run(test_db, type="supplier", mode="FILE_VS_GOLDEN", source_ids=[src1.id], name=None, username="u")


def test_create_run_conflicts_with_running_run_same_type(test_db):
    src1 = _make_source(test_db, "s1")
    src2 = _make_source(test_db, "s2")
    existing = MatchRun(type="supplier", mode="FILE_VS_FILE", status="running", created_by="u")
    test_db.add(existing)
    test_db.commit()
    with pytest.raises(MatchConflictError) as exc:
        create_run(
            test_db, type="supplier", mode="FILE_VS_FILE", source_ids=[src1.id, src2.id], name=None, username="u"
        )
    assert exc.value.run_id == existing.id


def test_create_run_file_vs_file_links_sources(test_db):
    src1 = _make_source(test_db, "s1")
    src2 = _make_source(test_db, "s2")
    test_db.commit()
    run = create_run(
        test_db, type="supplier", mode="FILE_VS_FILE", source_ids=[src1.id, src2.id], name=None, username="u"
    )
    assert {s.id for s in run.sources} == {src1.id, src2.id}
    assert run.status == "pending"


def test_create_run_happy_path_returns_pending(test_db):
    src1 = _make_source(test_db, "s1")
    src2 = _make_source(test_db, "s2")
    run = create_run(
        test_db, type="supplier", mode="FILE_VS_FILE", source_ids=[src1.id, src2.id], name="aug", username="u"
    )
    test_db.commit()
    assert run.status == "pending"
    assert run.mode == "FILE_VS_FILE"
    assert {s.id for s in run.sources} == {src1.id, src2.id}


def test_create_run_rejects_unknown_record_type(test_db):
    src1 = _make_source(test_db, "s1")
    src2 = _make_source(test_db, "s2")
    test_db.commit()
    with pytest.raises(MatchNotFoundError, match="Unknown record type"):
        create_run(
            test_db, type="nonexistent", mode="FILE_VS_FILE", source_ids=[src1.id, src2.id], name=None, username="u"
        )


def test_create_run_file_vs_golden_succeeds_when_unified_exists(test_db):
    src1 = _make_source(test_db, "s1")
    ur = UnifiedRecord(
        type="supplier", name="Golden Corp", fields={}, provenance={}, source_record_ids=[], created_by="u"
    )
    test_db.add(ur)
    test_db.commit()
    run = create_run(test_db, type="supplier", mode="FILE_VS_GOLDEN", source_ids=[src1.id], name=None, username="u")
    assert run.status == "pending"
    assert run.mode == "FILE_VS_GOLDEN"
    assert {s.id for s in run.sources} == {src1.id}
