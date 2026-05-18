"""Tests that FieldDef.normalize='identifier' canonicalizes values at ingestion."""

from contextlib import contextmanager
from unittest.mock import patch

import numpy as np

from app.models.batch import ImportBatch
from app.models.enums import BatchStatus
from app.models.source import DataSource
from app.models.staging import StagedRecord
from app.record_types import _testing_clear_registry, all_types, register
from app.record_types.base import FieldDef, RecordType, Role, Signal


@contextmanager
def _temporary_type(rt: RecordType):
    """Register `rt` for the test, then restore the original registry."""
    saved = all_types()
    _testing_clear_registry()
    for t in saved:
        register(t)
    register(rt)
    try:
        yield
    finally:
        _testing_clear_registry()
        for t in saved:
            register(t)


SAMPLE_CSV = b"Name;BIC;IBAN\nArab Tunisian Bank; atbk tntt ;tn97 0100 1020 1105 0086 1125\n"


@patch("app.services.ingestion.compute_embeddings")
def test_identifier_fields_are_canonicalized(mock_embed, test_db):
    """BIC and IBAN with internal whitespace and lowercase letters get normalized."""
    mock_embed.return_value = np.zeros((1, 384), dtype=np.float32)

    test_type = RecordType(
        key="test_bank",
        label="Test Bank",
        fields=(
            FieldDef("bank_name", "Bank Name", role=Role.NAME, required=True),
            FieldDef("bic", "BIC", role=Role.CODE, normalize="identifier"),
            FieldDef("iban", "IBAN", role=Role.CODE, normalize="identifier"),
        ),
        signals=(Signal(kind="jaro_winkler", field="bank_name", weight=1.0),),
    )

    with _temporary_type(test_type):
        source = DataSource(
            name="test bank source",
            type="test_bank",
            delimiter=";",
            column_mapping={
                "bank_name": "Name",
                "bic": "BIC",
                "iban": "IBAN",
            },
            identity_field_key="bank_name",
        )
        test_db.add(source)
        test_db.flush()

        batch = ImportBatch(
            data_source_id=source.id,
            filename="banks.csv",
            original_filename="banks.csv",
            file_extension=".csv",
            uploaded_by="testuser",
            status=BatchStatus.PENDING,
        )
        test_db.add(batch)
        test_db.flush()

        from app.services.ingestion import run_ingestion

        run_ingestion(test_db, batch.id, SAMPLE_CSV)

        record = test_db.query(StagedRecord).one()
        # Identifier fields: internal whitespace stripped, uppercased.
        assert record.fields["bic"] == "ATBKTNTT"
        assert record.fields["iban"] == "TN9701001020110500861125"
        # Non-identifier field: untouched aside from outer-whitespace strip.
        assert record.fields["bank_name"] == "Arab Tunisian Bank"
