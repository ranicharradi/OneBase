from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, func

from app.models.base import Base


class DataSource(Base):
    __tablename__ = "data_sources"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    file_format = Column(String(20), nullable=False, default="csv")
    delimiter = Column(String(5), default=";")
    column_mapping = Column(JSON, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    filename_pattern = Column(String(255), nullable=True, default=None)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
