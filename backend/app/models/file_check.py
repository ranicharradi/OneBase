from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from app.models.base import Base
from app.models.enums import FileCheckStatus


class FileCheckReport(Base):
    __tablename__ = "file_check_reports"

    id = Column(Integer, primary_key=True, autoincrement=True)
    original_filename = Column(String(255), nullable=False)
    stored_filename = Column(String(255), nullable=False)
    file_size_bytes = Column(Integer, nullable=False)
    delimiter = Column(String(8), nullable=False)
    status = Column(String(20), nullable=False, default=FileCheckStatus.PROCESSING)
    total_rows = Column(Integer, nullable=False, default=0)
    rows_with_issues = Column(Integer, nullable=False, default=0)
    empty_row_count = Column(Integer, nullable=False, default=0)
    missing_value_count = Column(Integer, nullable=False, default=0)
    corrupted_value_count = Column(Integer, nullable=False, default=0)
    stored_issue_count = Column(Integer, nullable=False, default=0)
    issue_cap_reached = Column(Boolean, nullable=False, default=False)
    criteria_version = Column(String(50), nullable=False, default="v1")
    error_message = Column(Text, nullable=True)
    checked_by = Column(String(100), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime, nullable=True)

    issues = relationship(
        "FileCheckIssue",
        back_populates="report",
        cascade="all, delete-orphan",
        order_by="FileCheckIssue.row_number",
    )


class FileCheckIssue(Base):
    __tablename__ = "file_check_issues"

    id = Column(Integer, primary_key=True, autoincrement=True)
    report_id = Column(Integer, ForeignKey("file_check_reports.id"), nullable=False, index=True)
    row_number = Column(Integer, nullable=False)
    column_name = Column(String(255), nullable=True)
    issue_type = Column(String(50), nullable=False)
    severity = Column(String(20), nullable=False)
    value_preview = Column(String(255), nullable=True)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    report = relationship("FileCheckReport", back_populates="issues")
