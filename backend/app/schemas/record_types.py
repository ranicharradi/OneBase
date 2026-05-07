# backend/app/schemas/record_types.py
"""Pydantic mirrors of RecordType / FieldDef / Signal for the API surface."""

from pydantic import BaseModel


class FieldDefSchema(BaseModel):
    key: str
    label: str
    role: str
    required: bool
    synonyms: list[str] = []


class SignalSchema(BaseModel):
    kind: str
    field: str
    weight: float


class RecordTypeSchema(BaseModel):
    key: str
    label: str
    fields: list[FieldDefSchema]
    signals: list[SignalSchema]


class RecordTypeSummary(BaseModel):
    key: str
    label: str
    field_count: int


class RecordTypeListResponse(BaseModel):
    types: list[RecordTypeSummary]
