"""Pydantic v2 schemas for data source management."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.schemas import APIResponse


class DataSourceCreate(BaseModel):
    """Request schema for creating a data source.

    `type` is the RecordType key (e.g. "supplier"); the source is locked to it.
    `column_mapping` keys are the type's FieldDef.keys; values are the CSV column
    headers. Validation against the registered type is done in the router/service.
    """

    name: str = Field(min_length=1, max_length=100)
    type: str = Field(min_length=1, max_length=50)
    description: str | None = None
    delimiter: str = ";"
    column_mapping: dict[str, str]


class DataSourceResponse(APIResponse):
    """Response schema for a data source."""

    id: int
    name: str
    type: str
    description: str | None
    delimiter: str
    column_mapping: dict[str, Any]
    created_at: datetime | None = None
    updated_at: datetime | None = None


class SuggestMappingRequest(BaseModel):
    record_type: str
    headers: list[str]
    sample_rows: list[dict] = []  # capped server-side


class SuggestMappingResponse(BaseModel):
    suggestions: dict[str, str | None]
    model: str
    latency_ms: int


class DetectHeadersResponse(BaseModel):
    """Response for POST /api/sources/detect-headers."""

    columns: list[str]
    delimiter: str | None
    format: str  # "csv" | "xlsx"
