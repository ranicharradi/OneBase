from app.schemas import APIResponse, FieldProvenance, PaginatedResponse
from app.schemas.file_check import FileCheckReportListResponse


class Item(APIResponse):
    value: int


def test_paginated_response_serializes_items():
    response = PaginatedResponse[Item](items=[Item(value=1)], total=1, has_more=False)

    assert response.model_dump() == {"items": [{"value": 1}], "total": 1, "has_more": False}


def test_field_provenance_is_shared_api_response():
    provenance = FieldProvenance(value="Acme", source_record_id=42, auto=True)

    assert isinstance(provenance, APIResponse)
    assert provenance.model_dump()["source_record_id"] == 42


def test_file_check_list_response_preserves_existing_shape():
    response = FileCheckReportListResponse(items=[], total=0)

    assert response.model_dump() == {"items": [], "total": 0}
