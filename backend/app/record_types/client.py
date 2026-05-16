"""The Client record type.

Mirrors the Sage X3 BPCUSTOMER table layout in the EOT/TC/TTEI exports.
The export does not currently include addresses, contact info, or VAT
registration numbers — those live in separate Sage X3 tables. Matching
therefore relies primarily on name similarity, lightly corroborated by
group / VAT category / currency.
"""

from app.record_types import register
from app.record_types.base import FieldDef, RecordType, Role, Signal

CLIENT = RecordType(
    key="client",
    label="Client",
    fields=(
        FieldDef(
            "customer_name",
            label="Customer Name",
            role=Role.NAME,
            required=True,
            synonyms=("BPCNAM_0", "customer_name", "client_name", "nom_client", "raison_sociale"),
        ),
        FieldDef(
            "short_name",
            label="Short Name",
            role=Role.EXTRA,
            synonyms=("BPCSHO_0", "short_name", "alias"),
        ),
        FieldDef(
            "customer_group",
            label="Customer Group",
            role=Role.ENUM,
            synonyms=("BCGCOD_0", "customer_group", "group", "groupe"),
        ),
        FieldDef(
            "vat_category",
            label="VAT Category",
            role=Role.ENUM,
            synonyms=("VACBPR_0", "vat_category", "tva", "regime_tva"),
        ),
        FieldDef(
            "currency",
            label="Currency",
            role=Role.ENUM,
            synonyms=("CUR_0", "currency", "devise"),
        ),
        FieldDef(
            "customer_type",
            label="Customer Type",
            role=Role.ENUM,
            synonyms=("BPCTYP_0", "customer_type", "type_client"),
        ),
    ),
    signals=(
        Signal(kind="jaro_winkler", field="customer_name", weight=0.30),
        Signal(kind="token_jaccard", field="customer_name", weight=0.20),
        Signal(kind="embedding_cosine", field="customer_name", weight=0.30),
        Signal(kind="jaro_winkler", field="short_name", weight=0.10),
        Signal(kind="exact_ci", field="customer_group", weight=0.04),
        Signal(kind="exact_ci", field="vat_category", weight=0.03),
        Signal(kind="exact_ci", field="currency", weight=0.03),
    ),
)

register(CLIENT)
