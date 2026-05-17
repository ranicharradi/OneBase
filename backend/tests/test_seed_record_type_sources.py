"""Tests for the seed_record_type_sources script."""

from app.models.source import DataSource


def test_seed_creates_six_sources(test_db):
    from scripts.seed_record_type_sources import seed

    created = seed(test_db)
    assert created == 6

    names = sorted(n for (n,) in test_db.query(DataSource.name).all())
    assert names == [
        "banks_eot",
        "banks_tc",
        "banks_ttei",
        "clients_eot",
        "clients_tc",
        "clients_ttei",
    ]


def test_seed_is_idempotent(test_db):
    from scripts.seed_record_type_sources import seed

    assert seed(test_db) == 6
    assert seed(test_db) == 0  # second run inserts nothing

    assert test_db.query(DataSource).count() == 6


def test_seed_bank_mapping_complete(test_db):
    from scripts.seed_record_type_sources import seed

    seed(test_db)
    src = test_db.query(DataSource).filter(DataSource.name == "banks_eot").one()
    assert src.type == "bank"
    expected_keys = {
        "bank_name",
        "short_name",
        "bic",
        "iban",
        "city",
        "country",
    }
    assert set(src.column_mapping.keys()) == expected_keys
    assert src.column_mapping["bank_name"] == "DES_0"
    assert src.column_mapping["iban"] == "IBACOD_0"


def test_seed_client_mapping_complete(test_db):
    from scripts.seed_record_type_sources import seed

    seed(test_db)
    src = test_db.query(DataSource).filter(DataSource.name == "clients_tc").one()
    assert src.type == "client"
    expected_keys = {
        "customer_name",
        "short_name",
        "customer_group",
        "vat_category",
        "currency",
        "customer_type",
    }
    assert set(src.column_mapping.keys()) == expected_keys
    assert src.column_mapping["customer_name"] == "BPCNAM_0"
