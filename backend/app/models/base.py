from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


def json_type():
    """Use JSONB on PostgreSQL while preserving generic JSON for SQLite tests."""
    return JSON().with_variant(JSONB, "postgresql")
