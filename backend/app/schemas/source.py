"""Pydantic v2 schemas for data source management."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ColumnMapping(BaseModel):
    """Mapping from canonical field names to CSV column headers."""

    model_config = ConfigDict(extra="forbid")

    supplier_name: str
    supplier_code: str
    short_name: str | None = None
    currency: str | None = None
    payment_terms: str | None = None
    contact_name: str | None = None
    supplier_type: str | None = None


class DataSourceCreate(BaseModel):
    """Request schema for creating a data source."""

    name: str = Field(min_length=1, max_length=100)
    description: str | None = None
    file_format: str = "csv"
    delimiter: str = ";"
    column_mapping: ColumnMapping


class DataSourceUpdate(BaseModel):
    """Request schema for updating a data source."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = None
    delimiter: str | None = None
    column_mapping: ColumnMapping | None = None


class DataSourceResponse(BaseModel):
    """Response schema for a data source."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    file_format: str
    delimiter: str
    column_mapping: dict[str, Any]
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ColumnDetectResponse(BaseModel):
    """Response schema for column detection."""

    columns: list[str]
