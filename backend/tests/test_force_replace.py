"""End-to-end test for force-replace re-upload via the ingestion service."""

from unittest.mock import patch

import numpy as np

from app.models.batch import ImportBatch
from app.models.enums import BatchStatus, RecordStatus
from app.models.source import DataSource
from app.models.staging import StagedRecord


@patch("app.services.ingestion.compute_embeddings")
def test_force_replace_supersedes_all_prior(mock_embed, test_db):
    mock_embed.return_value = np.zeros((10, 384), dtype=np.float32)
    from app.services.ingestion import run_ingestion

    src = DataSource(
        name="src",
        type="supplier",
        delimiter=";",
        column_mapping={"supplier_code": "Code", "supplier_name": "Name"},
        identity_field_key="supplier_code",
    )
    test_db.add(src)
    test_db.flush()

    v1 = b"Code;Name\nA;Acme\nB;Beta\n"
    b1 = ImportBatch(
        data_source_id=src.id,
        filename="u1.csv",
        original_filename="u1.csv",
        file_extension=".csv",
        uploaded_by="x",
        status=BatchStatus.PENDING,
    )
    test_db.add(b1)
    test_db.flush()
    run_ingestion(test_db, b1.id, v1)

    v2 = b"Code;Name\nX;Xena\nY;Yvonne\n"
    b2 = ImportBatch(
        data_source_id=src.id,
        filename="u2.csv",
        original_filename="u2.csv",
        file_extension=".csv",
        uploaded_by="x",
        status=BatchStatus.PENDING,
    )
    test_db.add(b2)
    test_db.flush()
    run_ingestion(test_db, b2.id, v2, force_replace=True)

    rows = test_db.query(StagedRecord).filter(StagedRecord.data_source_id == src.id).all()
    by_status = {}
    for r in rows:
        by_status.setdefault(r.status, []).append(r.fields["supplier_code"])

    assert sorted(by_status[RecordStatus.SUPERSEDED]) == ["A", "B"]
    assert sorted(by_status[RecordStatus.ACTIVE]) == ["X", "Y"]
    assert b2.ingest_stats["force_replace"] is True
    assert b2.ingest_stats["inserted"] == 2
    assert b2.ingest_stats["retired"] == 0
