"""Blocking skips rows whose normalized_name is a placeholder (SUP / DIVERS / blank / etc.)."""

from app.models.batch import ImportBatch
from app.models.enums import BatchStatus, RecordStatus
from app.models.source import DataSource
from app.models.staging import StagedRecord
from app.services.blocking import text_block
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


def _seed(test_db, src, batch, normalized: str | None) -> StagedRecord:
    rec = StagedRecord(
        import_batch_id=batch.id,
        data_source_id=src.id,
        type="supplier",
        name=normalized or "",
        normalized_name=normalized,
        fields={"supplier_name": normalized or ""},
        raw_data={},
        status=RecordStatus.ACTIVE,
    )
    test_db.add(rec)
    test_db.flush()
    return rec


def test_text_block_quarantines_placeholder_rows(test_db):
    src_a, batch_a = _make_src(test_db, "ERP-A")
    src_b, batch_b = _make_src(test_db, "ERP-B")

    # Placeholder names — must not enter any bucket
    placeholder_ids = [
        _seed(test_db, src_a, batch_a, "SUP").id,
        _seed(test_db, src_a, batch_a, "DIVERS").id,
        _seed(test_db, src_a, batch_a, "X").id,
        _seed(test_db, src_a, batch_a, "123").id,
        _seed(test_db, src_a, batch_a, None).id,
        _seed(test_db, src_a, batch_a, "A SUPPRIMER").id,
    ]
    # Real names on both sides so SOME pair would exist if buckets formed
    real_a = _seed(test_db, src_a, batch_a, "ACME CORP")
    real_b = _seed(test_db, src_b, batch_b, "ACME CORP")
    # A placeholder on side B for symmetry
    sup_b = _seed(test_db, src_b, batch_b, "SUP")
    test_db.commit()

    side_a = RecordSet(
        type_key="supplier",
        refs=[RecordRef(rid, "staged") for rid in [*placeholder_ids, real_a.id]],
    )
    side_b = RecordSet(
        type_key="supplier",
        refs=[RecordRef(real_b.id, "staged"), RecordRef(sup_b.id, "staged")],
    )

    pairs = text_block(test_db, side_a, side_b)

    pair_ids: set[frozenset[int]] = {frozenset((p[0].id, p[1].id)) for p in pairs}
    # The only valid pair is ACME CORP × ACME CORP
    assert pair_ids == {frozenset((real_a.id, real_b.id))}
    # No pair involves any placeholder row
    for pid in placeholder_ids + [sup_b.id]:
        assert not any(pid in s for s in pair_ids)
