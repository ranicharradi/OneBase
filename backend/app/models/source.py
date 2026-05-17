from sqlalchemy import Column, DateTime, Integer, String, Text, func

from app.models.base import Base, json_type


class DataSource(Base):
    __tablename__ = "data_sources"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False)
    type = Column(String(50), nullable=False)  # RecordType.key, locked at creation
    description = Column(Text, nullable=True)
    delimiter = Column(String(5), default=";")
    column_mapping = Column(json_type(), nullable=False)
    identity_field_key = Column(String(64), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
