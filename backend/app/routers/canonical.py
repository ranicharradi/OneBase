"""Canonical field registry API — read-only metadata for the frontend."""

from fastapi import APIRouter, Depends

from app.canonical import CANONICAL_FIELDS
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.canonical import CanonicalFieldResponse, CanonicalFieldsResponse

router = APIRouter(prefix="/api", tags=["canonical"])


@router.get("/canonical-fields", response_model=CanonicalFieldsResponse)
def list_canonical_fields(
    _user: User = Depends(get_current_user),
) -> CanonicalFieldsResponse:
    """Return the canonical supplier field registry for UI rendering."""
    return CanonicalFieldsResponse(
        fields=[
            CanonicalFieldResponse(
                key=f.key,
                label=f.label,
                required=f.required,
                dtype=f.dtype,
                max_length=f.max_length,
            )
            for f in CANONICAL_FIELDS
        ]
    )
