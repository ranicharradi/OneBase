from app.models.batch import ImportBatch
from app.models.enums import BatchStatus, RecordStatus
from app.models.source import DataSource
from app.models.staging import StagedRecord
from app.models.unified import UnifiedRecord
from app.services.record_set import RecordRef, RecordSet


def _seed(test_db):
    src = DataSource(name="src1", type="supplier", column_mapping={"name": "x"})
    test_db.add(src)
    test_db.flush()
    batch = ImportBatch(
        data_source_id=src.id,
        filename="a.csv",
        uploaded_by="u",
        status=BatchStatus.COMPLETED,
    )
    test_db.add(batch)
    test_db.flush()
    r1 = StagedRecord(
        type="supplier",
        import_batch_id=batch.id,
        data_source_id=src.id,
        name="ACME",
        normalized_name="ACME",
        status=RecordStatus.ACTIVE,
        fields={},
    )
    r2 = StagedRecord(
        type="supplier",
        import_batch_id=batch.id,
        data_source_id=src.id,
        name="ACME LTD",
        normalized_name="ACME LTD",
        status=RecordStatus.ACTIVE,
        fields={},
    )
    test_db.add_all([r1, r2])
    test_db.flush()
    return batch, [r1, r2]


def test_from_batch_returns_active_staged_refs(test_db):
    batch, records = _seed(test_db)
    rs = RecordSet.from_batch(test_db, batch.id)
    assert rs.type_key == "supplier"
    ids = sorted(r.id for r in rs.refs)
    assert ids == sorted(r.id for r in records)
    assert all(r.kind == "staged" for r in rs.refs)


def test_from_unified_returns_kind_unified(test_db):
    u = UnifiedRecord(
        type="supplier",
        name="ACME",
        fields={},
        provenance={},
        source_record_ids=[],
        created_by="u",
    )
    test_db.add(u)
    test_db.flush()
    rs = RecordSet.from_unified(test_db, "supplier")
    assert len(rs.refs) == 1
    assert rs.refs[0].kind == "unified"
    assert rs.refs[0].id == u.id


def test_record_ref_is_hashable():
    a = RecordRef(id=1, kind="staged")
    b = RecordRef(id=1, kind="staged")
    c = RecordRef(id=1, kind="unified")
    assert a == b
    assert hash(a) == hash(b)
    assert a != c
