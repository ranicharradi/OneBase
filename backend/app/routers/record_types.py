# backend/app/routers/record_types.py
"""Record-type metadata routes — used by the frontend to render dynamic forms/UI."""

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_current_user
from app.models.user import User
from app.record_types import all_types
from app.record_types import get as get_record_type
from app.schemas.record_types import (
    FieldDefSchema,
    RecordTypeListResponse,
    RecordTypeSchema,
    RecordTypeSummary,
    SignalSchema,
)

router = APIRouter(prefix="/api/record-types", tags=["record_types"])


def _to_schema(rt) -> RecordTypeSchema:
    return RecordTypeSchema(
        key=rt.key,
        label=rt.label,
        fields=[FieldDefSchema(key=f.key, label=f.label, role=f.role.value, required=f.required) for f in rt.fields],
        signals=[SignalSchema(kind=s.kind, field=s.field, weight=s.weight) for s in rt.signals],
    )


@router.get("", response_model=RecordTypeListResponse)
def list_types(
    current_user: User = Depends(get_current_user),
) -> RecordTypeListResponse:
    return RecordTypeListResponse(
        types=[RecordTypeSummary(key=rt.key, label=rt.label, field_count=len(rt.fields)) for rt in all_types()]
    )


@router.get("/{key}", response_model=RecordTypeSchema)
def get_type(
    key: str,
    current_user: User = Depends(get_current_user),
) -> RecordTypeSchema:
    try:
        rt = get_record_type(key)
    except KeyError:
        raise HTTPException(404, detail=f"unknown record type {key!r}") from None
    return _to_schema(rt)
