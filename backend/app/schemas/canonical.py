"""Pydantic schemas for the canonical field registry API."""

from pydantic import BaseModel, ConfigDict


class CanonicalFieldResponse(BaseModel):
    """One canonical field, as served to the frontend."""

    model_config = ConfigDict(from_attributes=True)

    key: str
    label: str
    required: bool
    dtype: str
    max_length: int


class CanonicalFieldsResponse(BaseModel):
    """Registry payload for the frontend."""

    fields: list[CanonicalFieldResponse]
