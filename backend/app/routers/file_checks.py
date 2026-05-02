"""Standalone file check API endpoints."""

import os
import uuid
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.config import settings
from app.dependencies import get_current_user, get_db, require_role
from app.models.enums import FileCheckStatus, UserRole
from app.models.file_check import FileCheckIssue, FileCheckReport
from app.models.user import User
from app.schemas.file_check import (
    FileCheckReportDetailResponse,
    FileCheckReportListResponse,
    FileCheckReportResponse,
)
from app.services.file_check import FileCheckCriteria, analyze_file_content
from app.utils.paths import safe_upload_path

router = APIRouter(prefix="/api/file-checks", tags=["file-checks"])

UPLOAD_DIR = settings.upload_dir
os.makedirs(UPLOAD_DIR, exist_ok=True)

MAX_UPLOAD_SIZE = 50 * 1024 * 1024
ISSUE_CAP = 5000


@router.post("", response_model=FileCheckReportResponse, status_code=status.HTTP_201_CREATED)
async def create_file_check(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Upload and analyze a CSV or TSV file check report."""
    original_filename = file.filename
    if not original_filename or not original_filename.lower().endswith((".csv", ".tsv")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV or TSV files are accepted",
        )

    file_content = await file.read()
    if len(file_content) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"File exceeds maximum size of {MAX_UPLOAD_SIZE // (1024 * 1024)} MB",
        )

    stored_filename = f"{uuid.uuid4()}_{Path(original_filename).name}"
    filepath = safe_upload_path(UPLOAD_DIR, stored_filename)
    with open(filepath, "wb") as uploaded_file:
        uploaded_file.write(file_content)

    report = FileCheckReport(
        original_filename=original_filename,
        stored_filename=stored_filename,
        file_size_bytes=len(file_content),
        delimiter=",",
        status=FileCheckStatus.PROCESSING,
        criteria_version="v1",
        checked_by=current_user.username,
    )
    db.add(report)
    db.flush()

    try:
        analysis = analyze_file_content(
            file_content,
            filename=original_filename,
            criteria=FileCheckCriteria(),
            issue_cap=ISSUE_CAP,
        )
        report.delimiter = analysis.delimiter
        report.status = analysis.status
        report.total_rows = analysis.total_rows
        report.rows_with_issues = analysis.rows_with_issues
        report.empty_row_count = analysis.empty_row_count
        report.missing_value_count = analysis.missing_value_count
        report.corrupted_value_count = analysis.corrupted_value_count
        report.stored_issue_count = analysis.stored_issue_count
        report.issue_cap_reached = analysis.issue_cap_reached
        report.criteria_version = analysis.criteria_version
        report.completed_at = _utcnow()

        for issue in analysis.issues:
            db.add(
                FileCheckIssue(
                    report_id=report.id,
                    row_number=issue.row_number,
                    column_name=issue.column_name,
                    issue_type=issue.issue_type,
                    severity=issue.severity,
                    value_preview=issue.value_preview,
                    message=issue.message,
                )
            )
    except Exception as exc:
        report.status = FileCheckStatus.ERROR
        report.error_message = str(exc)[:500] or exc.__class__.__name__
        report.completed_at = _utcnow()

    db.commit()
    db.refresh(report)
    return report


@router.get("", response_model=FileCheckReportListResponse)
def list_file_checks(
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List file check report history."""
    query = db.query(FileCheckReport)
    total = query.count()
    items = (
        query.order_by(FileCheckReport.created_at.desc(), FileCheckReport.id.desc()).offset(offset).limit(limit).all()
    )
    return FileCheckReportListResponse(items=items, total=total)


@router.get("/{report_id}", response_model=FileCheckReportDetailResponse)
def get_file_check(
    report_id: int,
    issue_limit: int = Query(default=100, ge=1, le=500),
    issue_offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch a file check report with paginated issues."""
    report = db.query(FileCheckReport).filter(FileCheckReport.id == report_id).first()
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File check report not found")

    issue_query = db.query(FileCheckIssue).filter(FileCheckIssue.report_id == report_id)
    issue_total = issue_query.count()
    issues = (
        issue_query.order_by(FileCheckIssue.row_number.asc(), FileCheckIssue.id.asc())
        .offset(issue_offset)
        .limit(issue_limit)
        .all()
    )

    report_data = FileCheckReportResponse.model_validate(report).model_dump()
    return FileCheckReportDetailResponse(
        **report_data,
        issues=issues,
        issue_total=issue_total,
        issue_limit=issue_limit,
        issue_offset=issue_offset,
    )


def _utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)
