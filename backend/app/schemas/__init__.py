"""Shared schema helpers for OneBase API responses."""

from pydantic import BaseModel, ConfigDict


class APIResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class PaginatedResponse[T](APIResponse):
    items: list[T]
    total: int
    has_more: bool


class FieldProvenance(APIResponse):
    """Provenance for a single field in a unified record."""

    value: str | None = None
    source_entity: str | None = None
    source_record_id: int | None = None
    auto: bool = False
    chosen_by: str | None = None
    chosen_at: str | None = None
