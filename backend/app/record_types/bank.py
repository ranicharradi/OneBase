"""The Bank record type.

Mirrors the Sage X3 BANK table layout in the EOT/TC/TTEI exports.

Identifier fields (BIC, IBAN) use normalize="identifier" so internal whitespace
gets stripped and case is folded before storage. The matching uses
iban_prefix_ci on the IBAN (chars [4:12] — bank+branch slot) because the full
IBAN is per-account and never matches cross-source.

Scoring: 'contributing_weight' so that a missing identifier (BIC absent on small
Tunisian banks) doesn't penalize a clean name match. The NAME-required guard
in score_pair prevents empty-name false positives.

Match unit: the physical bank entity (currency is intentionally *not* a signal;
the bank_name normalizer strips currency tokens via CURRENCY_STOPWORDS so
"Arab Tunisian Bank" and "Arab Tunisian Bank TND" collapse).
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
    ),
    signals=(
        Signal(kind="exact_ci", field="bic", weight=0.30),
        Signal(kind="iban_prefix_ci", field="iban", weight=0.18),
        Signal(kind="jaro_winkler", field="short_name", weight=0.13),
        Signal(kind="embedding_cosine", field="bank_name", weight=0.15),
        Signal(kind="jaro_winkler", field="bank_name", weight=0.12),
        Signal(kind="token_jaccard", field="bank_name", weight=0.07),
        Signal(kind="exact_ci", field="city", weight=0.03),
        Signal(kind="exact_ci", field="country", weight=0.02),
    ),
    scoring="contributing_weight",
    confidence_threshold=0.75,
)

register(BANK)
