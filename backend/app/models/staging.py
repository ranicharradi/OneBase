from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    func,
)

try:
    from pgvector.sqlalchemy import Vector
except ImportError:
    Vector = None  # SQLite tests fall back to LargeBinary

from app.models.base import Base
from app.models.enums import RecordStatus


class StagedRecord(Base):
    """A single ingested record awaiting matching/merge.

    Hybrid storage:
      - `name`/`normalized_name`/`name_embedding`: universal columns the matcher
        always reads. Populated from the type's NAME-role field at ingestion.
      - `fields`: JSONB holding all other fields keyed by FieldDef.key.
    """

    __tablename__ = "staged_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    import_batch_id = Column(Integer, ForeignKey("import_batches.id"), nullable=False)
    data_source_id = Column(Integer, ForeignKey("data_sources.id"), nullable=False)
    type = Column(String(50), nullable=False)  # RecordType.key
    status = Column(String(20), default=RecordStatus.ACTIVE)
    name = Column(String(255), nullable=True)
    normalized_name = Column(String(255), nullable=True)
    name_embedding = Column(Vector(384) if Vector else LargeBinary, nullable=True)
    fields = Column(JSON, nullable=False, default=dict)
    raw_data = Column(JSON, nullable=False, default=dict)
    intra_source_group_id = Column(Integer, ForeignKey("staged_records.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("ix_staged_records_normalized_name", "normalized_name"),
        Index("ix_staged_records_source_status", "data_source_id", "status"),
        Index("ix_staged_records_type_source", "type", "data_source_id"),
        Index("ix_staged_records_intra_group", "intra_source_group_id"),
        Index(
            "ix_staged_records_name_embedding_hnsw",
            "name_embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"name_embedding": "vector_cosine_ops"},
        ),
    )
