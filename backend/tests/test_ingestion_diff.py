"""Tests for the pure diff_snapshot helper used by re-upload ingestion."""

from unittest.mock import patch

import numpy as np

from app.models.batch import ImportBatch
from app.models.enums import BatchStatus, RecordStatus
from app.models.source import DataSource
from app.models.staging import StagedRecord
from app.services.ingestion import DiffPlan, diff_snapshot


def test_diff_classifies_inserts_updates_retires():
    """diff_snapshot returns {insert, update, retire} keyed by identity key."""
    prior = {
        "V001": {"supplier_name": "Acme", "currency": "EUR"},
        "V002": {"supplier_name": "Beta", "currency": "USD"},
        "V003": {"supplier_name": "Gamma", "currency": "GBP"},
    }
    incoming = {
        "V001": {"supplier_name": "Acme", "currency": "EUR"},  # unchanged
        "V002": {"supplier_name": "Beta Corp", "currency": "USD"},  # field changed → update
        "V004": {"supplier_name": "Delta", "currency": "JPY"},  # new
    }

    plan = diff_snapshot(prior_by_key=prior, incoming_by_key=incoming)

    assert isinstance(plan, DiffPlan)
    assert plan.inserts == {"V004": {"supplier_name": "Delta", "currency": "JPY"}}
    assert plan.updates == {"V002": {"supplier_name": "Beta Corp", "currency": "USD"}}
    assert plan.retires == {"V003"}
    assert plan.unchanged == {"V001"}


def test_diff_handles_empty_prior():
    """All-new snapshot: everything is an insert."""
    plan = diff_snapshot(prior_by_key={}, incoming_by_key={"V001": {"supplier_name": "Acme"}})
    assert plan.inserts == {"V001": {"supplier_name": "Acme"}}
    assert plan.updates == {}
    assert plan.retires == set()
    assert plan.unchanged == set()


def test_diff_handles_empty_incoming():
    """Empty re-upload retires everything (caller may reject before reaching diff)."""
    plan = diff_snapshot(
        prior_by_key={"V001": {"supplier_name": "Acme"}},
        incoming_by_key={},
    )
    assert plan.retires == {"V001"}
    assert plan.inserts == {} and plan.updates == {}


def test_diff_treats_field_equality_as_unchanged():
    """Same key + identical fields → unchanged, not update."""
    same = {"V001": {"supplier_name": "Acme", "currency": "EUR"}}
    plan = diff_snapshot(prior_by_key=same, incoming_by_key=dict(same))
    assert plan.updates == {}
    assert plan.unchanged == {"V001"}


SUPPLIERS_V1 = (
    b"VendorCode;Name1;ShortName;Currency\nV001;Acme Corp;ACME;EUR\nV002;Beta GmbH;BETA;USD\nV003;Gamma LLC;GAMMA;GBP\n"
)
# V001 unchanged, V002 name changed, V003 removed, V004 new
SUPPLIERS_V2 = (
    b"VendorCode;Name1;ShortName;Currency\n"
    b"V001;Acme Corp;ACME;EUR\n"
    b"V002;Beta Corporation;BETA;USD\n"
    b"V004;Delta SARL;DELTA;JPY\n"
)


def _make_source(test_db):
    src = DataSource(
        name="Industry A Suppliers",
        type="supplier",
        delimiter=";",
        column_mapping={
            "supplier_code": "VendorCode",
            "supplier_name": "Name1",
            "short_name": "ShortName",
            "currency": "Currency",
        },
        identity_field_key="supplier_code",
    )
    test_db.add(src)
    test_db.flush()
    return src


def _make_batch(test_db, src, filename, original):
    batch = ImportBatch(
        data_source_id=src.id,
        filename=filename,
        original_filename=original,
        file_extension=".csv",
        uploaded_by="testuser",
        status=BatchStatus.PENDING,
    )
    test_db.add(batch)
    test_db.flush()
    return batch


@patch("app.services.ingestion.compute_embeddings")
def test_initial_upload_inserts_all(mock_embed, test_db):
    mock_embed.return_value = np.zeros((3, 384), dtype=np.float32)
    from app.services.ingestion import run_ingestion

    src = _make_source(test_db)
    batch = _make_batch(test_db, src, "u1_v1.csv", "v1.csv")

    row_count = run_ingestion(test_db, batch.id, SUPPLIERS_V1)

    assert row_count == 3
    assert batch.ingest_stats == {
        "inserted": 3,
        "updated": 0,
        "retired": 0,
        "unchanged": 0,
        "force_replace": False,
    }
    actives = (
        test_db.query(StagedRecord)
        .filter(
            StagedRecord.data_source_id == src.id,
            StagedRecord.status == RecordStatus.ACTIVE,
        )
        .all()
    )
    assert len(actives) == 3


@patch("app.services.ingestion.compute_embeddings")
def test_reupload_diff_insert_update_retire(mock_embed, test_db):
    mock_embed.return_value = np.zeros((10, 384), dtype=np.float32)
    from app.services.ingestion import run_ingestion

    src = _make_source(test_db)
    b1 = _make_batch(test_db, src, "u1_v1.csv", "v1.csv")
    run_ingestion(test_db, b1.id, SUPPLIERS_V1)
    v1_ids = {
        r.fields["supplier_code"]: r.id
        for r in test_db.query(StagedRecord).filter(StagedRecord.data_source_id == src.id).all()
    }

    b2 = _make_batch(test_db, src, "u2_v2.csv", "v2.csv")
    run_ingestion(test_db, b2.id, SUPPLIERS_V2)

    assert b2.ingest_stats == {
        "inserted": 1,
        "updated": 1,
        "retired": 1,
        "unchanged": 1,
        "force_replace": False,
    }

    rows = test_db.query(StagedRecord).filter(StagedRecord.data_source_id == src.id).all()
    by_code = {r.fields["supplier_code"]: r for r in rows}

    # V001 unchanged → still ACTIVE, same id
    assert by_code["V001"].status == RecordStatus.ACTIVE
    assert by_code["V001"].id == v1_ids["V001"]

    # V002 updated → still ACTIVE, same id, name changed
    assert by_code["V002"].status == RecordStatus.ACTIVE
    assert by_code["V002"].id == v1_ids["V002"]
    assert by_code["V002"].name == "Beta Corporation"

    # V003 missing in v2 → RETIRED, same id
    assert by_code["V003"].status == RecordStatus.RETIRED
    assert by_code["V003"].id == v1_ids["V003"]

    # V004 new → ACTIVE, new id
    assert by_code["V004"].status == RecordStatus.ACTIVE
    assert by_code["V004"].id not in v1_ids.values()


@patch("app.services.ingestion.compute_embeddings")
def test_retired_row_returning_flips_back_to_active(mock_embed, test_db):
    mock_embed.return_value = np.zeros((10, 384), dtype=np.float32)
    from app.services.ingestion import run_ingestion

    src = _make_source(test_db)
    b1 = _make_batch(test_db, src, "u1.csv", "u1.csv")
    run_ingestion(test_db, b1.id, SUPPLIERS_V1)
    b2 = _make_batch(test_db, src, "u2.csv", "u2.csv")
    run_ingestion(test_db, b2.id, SUPPLIERS_V2)  # V003 retired

    # v3 reintroduces V003
    v3 = (
        b"VendorCode;Name1;ShortName;Currency\n"
        b"V001;Acme Corp;ACME;EUR\n"
        b"V002;Beta Corporation;BETA;USD\n"
        b"V003;Gamma LLC;GAMMA;GBP\n"
        b"V004;Delta SARL;DELTA;JPY\n"
    )
    b3 = _make_batch(test_db, src, "u3.csv", "u3.csv")
    run_ingestion(test_db, b3.id, v3)

    rows = test_db.query(StagedRecord).filter(StagedRecord.data_source_id == src.id).all()
    v3_row = next(r for r in rows if r.fields.get("supplier_code") == "V003")
    assert v3_row.status == RecordStatus.ACTIVE
