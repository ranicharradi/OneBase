"""Unified (golden record) supplier models with full field-level provenance."""

from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    func,
)

from app.models.base import Base


class UnifiedSupplier(Base):
    """Golden record produced by merging matched staged suppliers.

    Each field carries provenance in the `provenance` JSONB column:
    {
      "name": {
        "value": "ACME CORP",
        "source_entity": "EOT",
        "source_record_id": 42,
        "auto": false,           # true if identical or source-only
        "chosen_by": "admin",
        "chosen_at": "2026-03-15T08:00:00"
      },
      ...
    }
    """

    __tablename__ = "unified_suppliers"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Final merged values
    name = Column(String(255), nullable=False)
    source_code = Column(String(50), nullable=True)
    short_name = Column(String(50), nullable=True)
    currency = Column(String(10), nullable=True)
    payment_terms = Column(String(50), nullable=True)
    contact_name = Column(String(255), nullable=True)
    supplier_type = Column(String(10), nullable=True)

    # Full field-level provenance
    provenance = Column(JSON, nullable=False)

    # IDs of staged suppliers that were merged into this record
    source_supplier_ids = Column(JSON, nullable=False)  # e.g. [1, 2]

    # Link back to match candidate that triggered merge (null for singleton promotions)
    match_candidate_id = Column(Integer, ForeignKey("match_candidates.id"), nullable=True)

    created_by = Column(String(100), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
