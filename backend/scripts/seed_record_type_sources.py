"""Seed default DataSource rows for the bank/client xlsx files in /data.

Idempotent: re-running is a no-op. Skips any source whose name already exists.

Usage:
    cd backend && ENV_PROFILE=dev python -m scripts.seed_record_type_sources
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
    "phone": "TEL_0",
    "website": "WEB_0",
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
    ("banks_eot", "bank", BANK_COLUMN_MAPPING, "BANKs EOT*"),
    ("banks_tc", "bank", BANK_COLUMN_MAPPING, "BANKs TC*"),
    ("banks_ttei", "bank", BANK_COLUMN_MAPPING, "BANKs TTEI*"),
    ("clients_eot", "client", CLIENT_COLUMN_MAPPING, "Clients EOT*"),
    ("clients_tc", "client", CLIENT_COLUMN_MAPPING, "Clients TC*"),
    ("clients_ttei", "client", CLIENT_COLUMN_MAPPING, "Clients TTEI*"),
]


def seed(db: Session) -> int:
    """Insert any missing default DataSource rows. Returns the number created."""
    existing = {n for (n,) in db.query(DataSource.name).all()}
    created = 0
    for name, type_key, mapping, pattern in SEEDS:
        if name in existing:
            continue
        db.add(
            DataSource(
                name=name,
                type=type_key,
                file_format="xlsx",
                delimiter=";",
                column_mapping=dict(mapping),
                filename_pattern=pattern,
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
