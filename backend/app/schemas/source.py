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
    filename_pattern: str | None = None


class DataSourceUpdate(BaseModel):
    """Request schema for updating a data source."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = None
    delimiter: str | None = None
    column_mapping: ColumnMapping | None = None
    filename_pattern: str | None = None


class DataSourceResponse(BaseModel):
    """Response schema for a data source."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    file_format: str
    delimiter: str
    column_mapping: dict[str, Any]
    filename_pattern: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ColumnDetectResponse(BaseModel):
    """Response schema for column detection."""

    columns: list[str]


class SourceMatchResult(BaseModel):
    """A single source match result from auto-detection."""

    source_id: int
    source_name: str
    column_match: bool
    filename_match: bool
    data_overlap_pct: float
    sample_size: int
    confidence: str  # "high", "medium", "low"


class SourceMatchResponse(BaseModel):
    """Response from the match-source endpoint."""

    filename: str
    file_ref: str
    detected_columns: list[str]
    detected_delimiter: str = ","
    matches: list[SourceMatchResult]
    suggested_source_id: int | None = None
    suggested_name: str


class FieldGuess(BaseModel):
    """A single field guess from the column guesser."""

    column: str | None = None
    confidence: float = 0.0


class GuessMappingResponse(BaseModel):
    """Response from the guess-mapping endpoint."""

    supplier_name: FieldGuess
    supplier_code: FieldGuess
    short_name: FieldGuess
    currency: FieldGuess
    payment_terms: FieldGuess
    contact_name: FieldGuess
    supplier_type: FieldGuess
