"""Tests for source-overlap probe (duplicate-source detection at upload)."""

from app.models.batch import ImportBatch
from app.models.enums import BatchStatus, RecordStatus
from app.models.source import DataSource
from app.models.staging import StagedRecord
from app.services.source_overlap import probe_overlap


def _seed_source(test_db, name, names, type_key="supplier"):
    src = DataSource(
        name=name,
        type=type_key,
        delimiter=";",
        column_mapping={"supplier_name": "Name"},
        identity_field_key="supplier_name",
    )
    test_db.add(src)
    test_db.flush()
    batch = ImportBatch(
        data_source_id=src.id,
        filename="test.csv",
        original_filename="test.csv",
        file_extension=".csv",
        uploaded_by="test",
        status=BatchStatus.COMPLETED,
    )
    test_db.add(batch)
    test_db.flush()
    for n in names:
        test_db.add(
            StagedRecord(
                import_batch_id=batch.id,
                data_source_id=src.id,
                type=type_key,
                name=n,
                normalized_name=n.upper(),
                fields={"supplier_name": n},
                raw_data={"Name": n},
                status=RecordStatus.ACTIVE,
            )
        )
    test_db.flush()
    return src


def test_overlap_high_with_existing_source(test_db):
    """A file that shares most rows with an existing source returns high overlap."""
    _seed_source(test_db, "Industry A", ["Acme", "Beta", "Gamma", "Delta"])
    incoming_normalized_names = ["ACME", "BETA", "GAMMA", "NEW"]  # 75% overlap

    results = probe_overlap(
        test_db, type_key="supplier", incoming_normalized_names=incoming_normalized_names, min_rows=4
    )
    assert len(results) == 1
    assert results[0].source_name == "Industry A"
    assert 0.7 < results[0].overlap_ratio < 0.8


def test_overlap_threshold_filters_low_signal_matches(test_db):
    """Sources below the threshold are not returned."""
    _seed_source(test_db, "Industry A", ["Acme", "Beta", "Gamma", "Delta"])
    incoming = ["ACME", "X", "Y", "Z"]  # 25% overlap

    results = probe_overlap(test_db, type_key="supplier", incoming_normalized_names=incoming, threshold=0.5, min_rows=4)
    assert results == []


def test_overlap_ignores_other_record_types(test_db):
    """Sources of a different record type are not surfaced."""
    # Seed enough rows so min_rows isn't the reason result is empty.
    _seed_source(test_db, "Banks", ["Acme Bank", "Beta Bank", "Gamma Bank", "Delta Bank"], type_key="bank")

    results = probe_overlap(
        test_db,
        type_key="supplier",
        incoming_normalized_names=["ACME BANK", "BETA BANK", "GAMMA BANK", "DELTA BANK"],
        min_rows=4,
    )
    assert results == []


def test_overlap_skips_placeholder_incoming_names(test_db):
    """SUP / DIVERS / blank rows in the incoming list must NOT inflate the ratio."""
    _seed_source(test_db, "Industry A", ["Acme", "Beta", "Gamma", "Delta"])
    # 8 incoming names: 4 placeholders + 4 real, of which 3 match the seeded source.
    # Without filtering: 3/8 = 0.375 (below 0.5 threshold → empty result).
    # With filtering: 3/4 = 0.75 → above threshold.
    incoming = ["ACME", "BETA", "GAMMA", "NEWCO", "SUP", "DIVERS", "", "123"]
    results = probe_overlap(
        test_db,
        type_key="supplier",
        incoming_normalized_names=incoming,
        threshold=0.5,
        min_rows=4,
    )
    assert len(results) == 1
    assert 0.7 < results[0].overlap_ratio < 0.8
    assert results[0].total_count == 4  # placeholders dropped from denominator
