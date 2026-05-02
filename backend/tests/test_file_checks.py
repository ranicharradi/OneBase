"""Tests for standalone file check reports."""

from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

from app.models.file_check import FileCheckIssue, FileCheckReport
from app.services.file_check import FileCheckCriteria, analyze_file_content


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


def test_analyze_detects_empty_rows_and_missing_required_values():
    content = b"Code,Name,Currency\n001,Acme,USD\n002,,EUR\n,,\n"
    result = analyze_file_content(
        content,
        filename="vendors.csv",
        criteria=FileCheckCriteria(required_columns=("Name",)),
        issue_cap=5000,
    )

    assert result.delimiter == ","
    assert result.total_rows == 3
    assert result.rows_with_issues == 2
    assert result.empty_row_count == 1
    assert result.missing_value_count == 1
    assert result.corrupted_value_count == 0
    assert result.stored_issue_count == 2
    assert result.status == "failed"
    assert [issue.issue_type for issue in result.issues] == ["missing_value", "empty_row"]
    assert result.issues[0].row_number == 3
    assert result.issues[0].column_name == "Name"
    assert result.issues[0].message == "Required value is missing"


def test_analyze_caps_stored_issues_but_counts_all_findings():
    content = "Code,Name\n" + "\n".join(f"{i}," for i in range(1, 6))
    result = analyze_file_content(
        content.encode(),
        filename="vendors.csv",
        criteria=FileCheckCriteria(required_columns=("Name",)),
        issue_cap=2,
    )

    assert result.total_rows == 5
    assert result.missing_value_count == 5
    assert result.rows_with_issues == 5
    assert result.issue_cap_reached is True
    assert len(result.issues) == 2


def test_analyze_clean_file_returns_clean_status():
    content = b"Code,Name\n001,Acme\n"
    result = analyze_file_content(
        content,
        filename="vendors.csv",
        criteria=FileCheckCriteria(required_columns=("Name",)),
        issue_cap=5000,
    )

    assert result.status == "clean"
    assert result.rows_with_issues == 0
    assert result.issues == []


def test_analyze_sparse_comma_csv_uses_comma_fallback_for_empty_row():
    content = b"Code,Name,Currency\n001\n,,\n"
    result = analyze_file_content(
        content,
        filename="vendors.csv",
        criteria=FileCheckCriteria(required_columns=("Name",)),
        issue_cap=5000,
    )

    assert result.delimiter == ","
    assert result.total_rows == 2
    assert result.empty_row_count == 1
    assert result.issues[-1].issue_type == "empty_row"


def test_analyze_counts_blank_physical_lines_as_empty_rows():
    content = b"Code,Name\n\n001,Acme\n"
    result = analyze_file_content(
        content,
        filename="vendors.csv",
        criteria=FileCheckCriteria(required_columns=("Name",)),
        issue_cap=5000,
    )

    assert result.total_rows == 2
    assert result.empty_row_count == 1
    assert result.rows_with_issues == 1
    assert result.issues[0].row_number == 2
    assert result.issues[0].message == "Entire row is empty"


def test_analyze_tsv_uses_tab_delimiter():
    content = b"Code\tName\n001\tAcme\n"
    result = analyze_file_content(
        content,
        filename="vendors.tsv",
        criteria=FileCheckCriteria(required_columns=("Name",)),
        issue_cap=5000,
    )

    assert result.delimiter == "\t"
    assert result.status == "clean"


def test_analyze_extra_value_prevents_empty_row_but_still_checks_required_columns():
    content = b"Code,Name\n,,USD\n"
    result = analyze_file_content(
        content,
        filename="vendors.csv",
        criteria=FileCheckCriteria(required_columns=("Name",)),
        issue_cap=5000,
    )

    assert result.total_rows == 1
    assert result.empty_row_count == 0
    assert result.missing_value_count == 1
    assert result.issues[0].issue_type == "missing_value"
    assert result.issues[0].column_name == "Name"
