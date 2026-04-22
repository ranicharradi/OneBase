"""The canonical supplier field registry.

Add or remove fields here. Downstream consumers discover fields from this list —
no duplication. Synonyms listed here replace the hand-maintained `_HEADER_EXACT`
dict previously in `services/column_guesser.py`.
"""

from dataclasses import dataclass
from typing import Literal

FieldDType = Literal["string", "code", "currency", "enum", "text"]


@dataclass(frozen=True)
class CanonicalField:
    """Declarative description of one canonical supplier field."""

    key: str
    label: str
    required: bool
    max_length: int
    dtype: FieldDType = "string"
    synonyms: tuple[str, ...] = ()


SUPPLIER_NAME = CanonicalField(
    key="supplier_name",
    label="Supplier Name",
    required=True,
    max_length=255,
    synonyms=(
        "supplier_name",
        "supplier name",
        "vendor_name",
        "vendor name",
        "company_name",
        "company name",
        "name",
    ),
)

SUPPLIER_CODE = CanonicalField(
    key="supplier_code",
    label="Supplier Code",
    required=True,
    max_length=50,
    dtype="code",
    synonyms=(
        "supplier_code",
        "supplier code",
        "vendor_code",
        "vendor code",
        "code",
    ),
)

SHORT_NAME = CanonicalField(
    key="short_name",
    label="Short Name",
    required=False,
    max_length=50,
    synonyms=(
        "short_name",
        "short name",
        "abbreviation",
        "abbrev",
        "alias",
    ),
)

CURRENCY = CanonicalField(
    key="currency",
    label="Currency",
    required=False,
    max_length=50,
    dtype="currency",
    synonyms=(
        "currency",
        "currency_code",
        "currency code",
        "cur",
    ),
)

PAYMENT_TERMS = CanonicalField(
    key="payment_terms",
    label="Payment Terms",
    required=False,
    max_length=50,
    dtype="enum",
    synonyms=(
        "payment_terms",
        "payment terms",
        "pay_terms",
        "terms",
    ),
)

CONTACT_NAME = CanonicalField(
    key="contact_name",
    label="Contact Name",
    required=False,
    max_length=255,
    synonyms=(
        "contact_name",
        "contact name",
        "contact_person",
        "contact person",
        "contact",
    ),
)

SUPPLIER_TYPE = CanonicalField(
    key="supplier_type",
    label="Supplier Type",
    required=False,
    max_length=50,
    dtype="enum",
    synonyms=(
        "supplier_type",
        "supplier type",
        "vendor_type",
        "vendor type",
        "type",
        "category",
    ),
)

CANONICAL_FIELDS: tuple[CanonicalField, ...] = (
    SUPPLIER_NAME,
    SUPPLIER_CODE,
    SHORT_NAME,
    CURRENCY,
    PAYMENT_TERMS,
    CONTACT_NAME,
    SUPPLIER_TYPE,
)

CANONICAL_FIELDS_BY_KEY: dict[str, CanonicalField] = {f.key: f for f in CANONICAL_FIELDS}

GLOBAL_EXCLUDE_HEADERS: frozenset[str] = frozenset(
    {
        "email",
        "e-mail",
        "contact_email",
        "contact email",
        "phone",
        "telephone",
        "tel",
        "fax",
        "mobile",
        "address",
        "street",
        "city",
        "state",
        "province",
        "zip",
        "zip_code",
        "postal_code",
        "postal code",
        "country",
        "country_code",
        "country code",
        "region",
        "website",
        "url",
        "tax_id",
        "tax id",
        "vat",
        "vat_number",
        "duns",
        "created_at",
        "updated_at",
        "modified_at",
        "date",
        "id",
        "notes",
        "description",
        "comments",
    }
)


def build_header_synonym_index() -> dict[str, str]:
    """Return a {synonym -> canonical key} flat index built from the registry.

    Replaces the former hand-maintained `_HEADER_EXACT` dict in column_guesser.
    Synonyms are stored in the registry already lowercased and stripped, so the
    index can be looked up directly after normalizing the CSV header the same way.
    """
    index: dict[str, str] = {}
    for field in CANONICAL_FIELDS:
        for syn in field.synonyms:
            index[syn] = field.key
    return index
