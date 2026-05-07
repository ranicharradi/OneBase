# backend/app/record_types/supplier.py
"""The Supplier record type — the platform's first registered type.

Mirrors the prior canonical-fields registry (app/canonical/fields.py) and the
six hardcoded signals in services/scoring.py so behavior stays byte-identical.
"""

from app.record_types import register
from app.record_types.base import FieldDef, RecordType, Role, Signal

SUPPLIER = RecordType(
    key="supplier",
    label="Supplier",
    fields=(
        FieldDef(
            "supplier_name",
            label="Supplier Name",
            role=Role.NAME,
            required=True,
            synonyms=("BPSNAM_0", "supplier_name", "name", "vendor_name", "nom_fournisseur", "raison_sociale"),
        ),
        FieldDef(
            "short_name",
            label="Short Name",
            role=Role.EXTRA,
            synonyms=("BPSSHO_0", "short_name", "short", "alias"),
        ),
        FieldDef(
            "currency",
            label="Currency",
            role=Role.ENUM,
            synonyms=("CUR_0", "currency", "cur", "devise"),
        ),
        FieldDef(
            "contact_name",
            label="Contact Name",
            role=Role.EXTRA,
            synonyms=("CNTNAM_0", "contact_name", "contact", "contact_person"),
        ),
    ),
    # Signal weights match the legacy MATCHING_WEIGHT_* defaults in app/config.py.
    # Each signal's `field` is a real FieldDef key — `embedding_cosine` happens to
    # read `record.name_embedding` directly and the type-construction validator
    # enforces that this signal references the NAME-role field.
    signals=(
        Signal(kind="jaro_winkler", field="supplier_name", weight=0.30),
        Signal(kind="token_jaccard", field="supplier_name", weight=0.20),
        Signal(kind="embedding_cosine", field="supplier_name", weight=0.25),
        Signal(kind="jaro_winkler", field="short_name", weight=0.10),
        Signal(kind="exact_ci", field="currency", weight=0.05),
        Signal(kind="jaro_winkler", field="contact_name", weight=0.10),
    ),
)

register(SUPPLIER)
