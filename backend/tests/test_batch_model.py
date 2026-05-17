"""Tests for ImportBatch model shape."""


def test_import_batch_has_new_columns():
    """ImportBatch carries original_filename, file_extension, ingest_stats."""
    from app.models.batch import ImportBatch

    cols = {c.name for c in ImportBatch.__table__.columns}
    assert "original_filename" in cols
    assert "file_extension" in cols
    assert "ingest_stats" in cols
