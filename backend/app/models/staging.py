from sqlalchemy import JSON, Column, DateTime, ForeignKey, Index, Integer, LargeBinary, String, func

try:
    from pgvector.sqlalchemy import Vector
except ImportError:
    # Fallback for environments without pgvector (e.g., SQLite tests)
    Vector = None

from app.models.base import Base
from app.models.enums import SupplierStatus


class StagedSupplier(Base):
    __tablename__ = "staged_suppliers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    import_batch_id = Column(Integer, ForeignKey("import_batches.id"), nullable=False)
    data_source_id = Column(Integer, ForeignKey("data_sources.id"), nullable=False)
    source_code = Column(String(50), nullable=True)
    name = Column(String(255), nullable=True)
    short_name = Column(String(50), nullable=True)
    currency = Column(String(50), nullable=True)
    payment_terms = Column(String(50), nullable=True)
    contact_name = Column(String(255), nullable=True)
    supplier_type = Column(String(50), nullable=True)
    status = Column(String(20), default=SupplierStatus.ACTIVE)  # active/superseded
    raw_data = Column(JSON, nullable=False)
    normalized_name = Column(String(255), nullable=True)
    name_embedding = Column(Vector(384) if Vector else LargeBinary, nullable=True)
    intra_source_group_id = Column(Integer, ForeignKey("staged_suppliers.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("ix_staged_normalized_name", "normalized_name"),
        Index("ix_staged_source_status", "data_source_id", "status"),
        Index("ix_staged_source_code", "data_source_id", "source_code"),
        Index("ix_staged_intra_group", "intra_source_group_id"),
        Index(
            "ix_staged_name_embedding_hnsw",
            "name_embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"name_embedding": "vector_cosine_ops"},
        ),
    )
