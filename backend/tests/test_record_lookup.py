"""Tests for the shared record + source enrichment lookup."""

from app.models.batch import ImportBatch
from app.models.enums import BatchStatus
from app.models.source import DataSource
from app.models.staging import StagedRecord
from app.services.record_lookup import load_enriched_records


def _setup_record(db, *, name="Acme", source_name="src", type_key="supplier", fields=None):
    src = DataSource(name=source_name, type=type_key, column_mapping={"name": "x"}, identity_field_key="name")
    db.add(src)
    db.flush()
    batch = ImportBatch(
        data_source_id=src.id,
        filename="f.csv",
        original_filename="f.csv",
        file_extension=".csv",
        uploaded_by="u",
        status=BatchStatus.COMPLETED,
    )
    db.add(batch)
    db.flush()
    rec = StagedRecord(
        type=type_key,
        data_source_id=src.id,
        import_batch_id=batch.id,
        name=name,
        normalized_name=name.lower(),
        fields=fields or {},
    )
    db.add(rec)
    db.flush()
    return rec, src


def test_empty_input_returns_empty_dict(test_db):
    assert load_enriched_records(test_db, []) == {}


def test_returns_record_with_source_name(test_db):
    rec, src = _setup_record(test_db, name="Acme Corp", source_name="vendor-list")
    result = load_enriched_records(test_db, [rec.id])
    assert result.keys() == {rec.id}
    info = result[rec.id]
    assert info["name"] == "Acme Corp"
    assert info["source_name"] == "vendor-list"
    assert info["fields"] == {}


def test_missing_id_omitted_silently(test_db):
    rec, _ = _setup_record(test_db)
    result = load_enriched_records(test_db, [rec.id, 99999])
    assert 99999 not in result
    assert rec.id in result
