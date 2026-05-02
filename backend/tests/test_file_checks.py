"""Tests for standalone file check reports."""

from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

from app.models.file_check import FileCheckIssue, FileCheckReport


def test_file_check_models_have_expected_tables(test_db):
    assert FileCheckReport.__tablename__ == "file_check_reports"
    assert FileCheckIssue.__tablename__ == "file_check_issues"


def test_file_check_migration_does_not_create_branch_head():
    backend_dir = Path(__file__).resolve().parents[1]
    alembic_config = Config(str(backend_dir / "alembic.ini"))
    script = ScriptDirectory.from_config(alembic_config)

    assert script.get_heads() == ["008"]


def test_file_check_report_issue_relationship(test_db):
    report = FileCheckReport(
        original_filename="vendors.csv",
        stored_filename="uuid_vendors.csv",
        file_size_bytes=42,
        delimiter=",",
        status="failed",
        total_rows=2,
        rows_with_issues=1,
        empty_row_count=0,
        missing_value_count=1,
        corrupted_value_count=0,
        stored_issue_count=1,
        issue_cap_reached=False,
        criteria_version="v1",
        checked_by="admin",
    )
    issue = FileCheckIssue(
        report=report,
        row_number=2,
        column_name="supplier_name",
        issue_type="missing_value",
        severity="error",
        value_preview="",
        message="Required value is missing",
    )
    test_db.add_all([report, issue])
    test_db.commit()
    test_db.refresh(report)

    assert report.id is not None
    assert report.issues[0].column_name == "supplier_name"
