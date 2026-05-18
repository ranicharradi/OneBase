from app.models.batch import ImportBatch
from app.models.enums import BatchStatus, RecordStatus
from app.models.source import DataSource
from app.models.staging import StagedRecord
from app.models.unified import UnifiedRecord
from app.services.record_set import RecordRef, RecordSet


def _seed(test_db):
    src = DataSource(name="src1", type="supplier", column_mapping={"name": "x"}, identity_field_key="name")
    test_db.add(src)
    test_db.flush()
    batch = ImportBatch(
        data_source_id=src.id,
        filename="a.csv",
        original_filename="a.csv",
        file_extension=".csv",
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


def test_from_source_returns_only_active_staged_records(test_db):
    from app.models.batch import ImportBatch
    from app.models.enums import BatchStatus, RecordStatus
    from app.models.source import DataSource
    from app.models.staging import StagedRecord
    from app.services.record_set import RecordSet

    src = DataSource(
        name="src1",
        type="supplier",
        delimiter=";",
        column_mapping={"supplier_name": "Name"},
        identity_field_key="supplier_name",
    )
    test_db.add(src)
    test_db.flush()
    b = ImportBatch(
        data_source_id=src.id,
        filename="f.csv",
        original_filename="f.csv",
        file_extension=".csv",
        uploaded_by="u",
        status=BatchStatus.COMPLETED,
    )
    test_db.add(b)
    test_db.flush()
    # 2 ACTIVE, 1 RETIRED, 1 SUPERSEDED
    for status, _ in [
        (RecordStatus.ACTIVE, "a"),
        (RecordStatus.ACTIVE, "b"),
        (RecordStatus.RETIRED, "c"),
        (RecordStatus.SUPERSEDED, "d"),
    ]:
        test_db.add(
            StagedRecord(
                import_batch_id=b.id,
                data_source_id=src.id,
                type="supplier",
                name="x",
                fields={},
                status=status,
            )
        )
    test_db.commit()

    rs = RecordSet.from_source(test_db, src.id)
    assert rs.type_key == "supplier"
    assert rs.size == 2
    assert all(ref.kind == "staged" for ref in rs.refs)


def test_from_source_raises_when_source_missing(test_db):
    import pytest
    from sqlalchemy.exc import NoResultFound

    from app.services.record_set import RecordSet

    with pytest.raises(NoResultFound):
        RecordSet.from_source(test_db, 99999)
