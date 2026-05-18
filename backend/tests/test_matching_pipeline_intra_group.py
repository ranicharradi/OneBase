"""run_matching_pipeline runs intra-source grouping as a pre-step."""

from unittest.mock import patch

from app.models.batch import ImportBatch
from app.models.enums import BatchStatus, RecordStatus
from app.models.match_run import MatchRun
from app.models.source import DataSource
from app.models.staging import StagedRecord
from app.services.matching import run_matching_pipeline
from app.services.record_set import RecordRef, RecordSet


def _make_src(test_db, name):
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
        filename=f"{name}.csv",
        original_filename=f"{name}.csv",
        file_extension=".csv",
        uploaded_by="x",
        status=BatchStatus.COMPLETED,
    )
    test_db.add(batch)
    test_db.flush()
    return src, batch


@patch("app.services.matching.text_block", return_value=set())
@patch("app.services.matching.embedding_block", return_value=set())
def test_pipeline_runs_intra_source_grouping_before_blocking(_mock_eb, _mock_tb, test_db):
    src_a, batch_a = _make_src(test_db, "ERP-A")
    src_b, batch_b = _make_src(test_db, "ERP-B")
    rows_a = []
    for n in ("Acme Corp SARL", "Acme Corp"):
        r = StagedRecord(
            import_batch_id=batch_a.id,
            data_source_id=src_a.id,
            type="supplier",
            name=n,
            normalized_name="ACME",
            fields={"supplier_name": n},
            raw_data={},
            status=RecordStatus.ACTIVE,
        )
        test_db.add(r)
        rows_a.append(r)
    r_b = StagedRecord(
        import_batch_id=batch_b.id,
        data_source_id=src_b.id,
        type="supplier",
        name="Beta GmbH",
        normalized_name="BETA",
        fields={"supplier_name": "Beta GmbH"},
        raw_data={},
        status=RecordStatus.ACTIVE,
    )
    test_db.add(r_b)
    test_db.flush()

    run = MatchRun(type="supplier", mode="FILE_VS_FILE", status="running", created_by="x")
    test_db.add(run)
    test_db.flush()

    side_a = RecordSet(type_key="supplier", refs=[RecordRef(r.id, "staged") for r in rows_a])
    side_b = RecordSet(type_key="supplier", refs=[RecordRef(r_b.id, "staged")])

    run_matching_pipeline(test_db, run.id, side_a, side_b)

    test_db.refresh(rows_a[0])
    test_db.refresh(rows_a[1])
    assert rows_a[0].intra_source_group_id is not None
    assert rows_a[0].intra_source_group_id == rows_a[1].intra_source_group_id

    test_db.refresh(r_b)
    assert r_b.intra_source_group_id is None


@patch("app.services.matching.text_block", return_value=set())
@patch("app.services.matching.embedding_block", return_value=set())
def test_pipeline_skips_grouping_when_a_side_is_empty(_mock_eb, _mock_tb, test_db):
    src_a, batch_a = _make_src(test_db, "ERP-EMPTY-A")
    r_a = StagedRecord(
        import_batch_id=batch_a.id,
        data_source_id=src_a.id,
        type="supplier",
        name="Acme Corp SARL",
        normalized_name="ACME",
        fields={"supplier_name": "Acme Corp SARL"},
        raw_data={},
        status=RecordStatus.ACTIVE,
    )
    test_db.add(r_a)
    test_db.flush()

    run = MatchRun(type="supplier", mode="FILE_VS_FILE", status="running", created_by="x")
    test_db.add(run)
    test_db.flush()

    side_a = RecordSet(type_key="supplier", refs=[RecordRef(r_a.id, "staged")])
    side_b = RecordSet(type_key="supplier", refs=[])

    run_matching_pipeline(test_db, run.id, side_a, side_b)

    test_db.refresh(r_a)
    assert r_a.intra_source_group_id is None  # no peer in same source → no group
