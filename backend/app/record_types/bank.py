"""The Bank record type.

Mirrors the Sage X3 BANK table layout in the EOT/TC/TTEI exports.
Identifier fields (BIC, IBAN) use normalize="identifier" so internal
whitespace gets stripped and case is folded before storage — this makes
exact_ci scoring robust to user-entered whitespace/case variation.

Match unit: the physical bank entity (currency is intentionally *not* a
signal — see docs/superpowers/specs/2026-05-16-bank-client-record-types-design.md).
"""

from app.record_types import register
from app.record_types.base import FieldDef, RecordType, Role, Signal

BANK = RecordType(
    key="bank",
    label="Bank",
    fields=(
        FieldDef(
            "bank_name",
            label="Bank Name",
            role=Role.NAME,
            required=True,
            synonyms=("DES_0", "bank_name", "name", "designation"),
        ),
        FieldDef(
            "short_name",
            label="Short Name",
            role=Role.EXTRA,
            synonyms=("DESSHO_0", "short_name", "alias"),
        ),
        FieldDef(
            "bic",
            label="BIC / SWIFT",
            role=Role.CODE,
            normalize="identifier",
            synonyms=("BICCOD_0", "bic", "swift"),
        ),
        FieldDef(
            "iban",
            label="IBAN",
            role=Role.CODE,
            normalize="identifier",
            synonyms=("IBACOD_0", "iban"),
        ),
        FieldDef(
            "city",
            label="City",
            role=Role.EXTRA,
            synonyms=("CTY_0", "city", "ville"),
        ),
        FieldDef(
            "country",
            label="Country",
            role=Role.ENUM,
            synonyms=("CRY_0", "country", "pays"),
        ),
        FieldDef(
            "phone",
            label="Phone",
            role=Role.PHONE,
            synonyms=("TEL_0", "phone", "tel"),
        ),
        FieldDef(
            "website",
            label="Website",
            role=Role.EXTRA,
            synonyms=("WEB_0", "website", "url"),
        ),
    ),
    signals=(
        Signal(kind="jaro_winkler", field="bank_name", weight=0.20),
        Signal(kind="token_jaccard", field="bank_name", weight=0.10),
        Signal(kind="embedding_cosine", field="bank_name", weight=0.20),
        Signal(kind="jaro_winkler", field="short_name", weight=0.08),
        Signal(kind="exact_ci", field="bic", weight=0.20),
        Signal(kind="exact_ci", field="iban", weight=0.15),
        Signal(kind="exact_ci", field="city", weight=0.05),
        Signal(kind="exact_ci", field="country", weight=0.02),
    ),
)

register(BANK)
