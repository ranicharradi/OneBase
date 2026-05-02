"""Pydantic v2 schemas for standalone file check reports."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class FileCheckIssueResponse(BaseModel):
    """Response schema for a stored file check issue."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    report_id: int
    row_number: int
    column_name: str | None
    issue_type: str
    severity: str
    value_preview: str | None
    message: str
    created_at: datetime | None = None


class FileCheckReportResponse(BaseModel):
    """Response schema for a file check report."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    original_filename: str
    stored_filename: str
    file_size_bytes: int
    delimiter: str
    status: str
    total_rows: int
    rows_with_issues: int
    empty_row_count: int
    missing_value_count: int
    corrupted_value_count: int
    stored_issue_count: int
    issue_cap_reached: bool
    criteria_version: str
    error_message: str | None
    checked_by: str
    created_at: datetime | None = None
    completed_at: datetime | None = None


class FileCheckReportDetailResponse(FileCheckReportResponse):
    """Detailed report response with paginated issues."""

    issues: list[FileCheckIssueResponse]
    issue_total: int
    issue_limit: int
    issue_offset: int


class FileCheckReportListResponse(BaseModel):
    """Paginated file check report history."""

    items: list[FileCheckReportResponse]
    total: int
