"""Seed default DataSource rows for the bank/client xlsx files in /data.

Idempotent: re-running is a no-op. Skips any source whose name already exists.

Usage:
    cd backend && python -m scripts.seed_record_type_sources
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.source import DataSource

BANK_COLUMN_MAPPING = {
    "bank_name": "DES_0",
    "short_name": "DESSHO_0",
    "bic": "BICCOD_0",
    "iban": "IBACOD_0",
    "city": "CTY_0",
    "country": "CRY_0",
}

CLIENT_COLUMN_MAPPING = {
    "customer_name": "BPCNAM_0",
    "short_name": "BPCSHO_0",
    "customer_group": "BCGCOD_0",
    "vat_category": "VACBPR_0",
    "currency": "CUR_0",
    "customer_type": "BPCTYP_0",
}

SEEDS = [
    ("banks_eot", "bank", BANK_COLUMN_MAPPING, "BANKs EOT*", "bank_name"),
    ("banks_tc", "bank", BANK_COLUMN_MAPPING, "BANKs TC*", "bank_name"),
    ("banks_ttei", "bank", BANK_COLUMN_MAPPING, "BANKs TTEI*", "bank_name"),
    ("clients_eot", "client", CLIENT_COLUMN_MAPPING, "Clients EOT*", "customer_name"),
    ("clients_tc", "client", CLIENT_COLUMN_MAPPING, "Clients TC*", "customer_name"),
    ("clients_ttei", "client", CLIENT_COLUMN_MAPPING, "Clients TTEI*", "customer_name"),
]


def seed(db: Session) -> int:
    """Insert any missing default DataSource rows. Returns the number created."""
    existing = {n for (n,) in db.query(DataSource.name).all()}
    created = 0
    for name, type_key, mapping, _pattern, identity_key in SEEDS:
        if name in existing:
            continue
        db.add(
            DataSource(
                name=name,
                type=type_key,
                delimiter=";",
                column_mapping=dict(mapping),
                identity_field_key=identity_key,
            )
        )
        created += 1
    db.flush()
    db.commit()
    return created


def main() -> None:
    with SessionLocal() as db:
        n = seed(db)
        print(f"seed: created {n} new DataSource row(s)")


if __name__ == "__main__":
    main()
