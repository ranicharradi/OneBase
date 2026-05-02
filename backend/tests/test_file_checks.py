"""Tests for standalone file check reports."""

from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

from app.models.file_check import FileCheckIssue, FileCheckReport
from app.models.user import User
from app.services.auth import create_token, hash_password
from app.services.file_check import FileCheckCriteria, analyze_file_content


def _file_check_auth_header(username: str) -> dict:
    return {"Authorization": f"Bearer {create_token(username)}"}


def _create_file_check_user(db, username: str, role: str) -> User:
    user = User(
        username=username,
        password_hash=hash_password("testpass123"),
        is_active=True,
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


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


def test_admin_can_upload_file_check(test_client, test_db):
    _create_file_check_user(test_db, "filecheck-admin", "admin")

    response = test_client.post(
        "/api/file-checks",
        files={"file": ("vendors.csv", b"Code,Name\n001,\n", "text/csv")},
        headers=_file_check_auth_header("filecheck-admin"),
    )

    assert response.status_code == 201
    data = response.json()
    assert data["original_filename"] == "vendors.csv"
    assert data["status"] == "failed"
    assert data["total_rows"] == 1
    assert data["missing_value_count"] == 1
    assert data["stored_issue_count"] == 1


def test_viewer_cannot_create_file_check(test_client, test_db):
    _create_file_check_user(test_db, "filecheck-viewer", "viewer")

    response = test_client.post(
        "/api/file-checks",
        files={"file": ("vendors.csv", b"Code,Name\n001,\n", "text/csv")},
        headers=_file_check_auth_header("filecheck-viewer"),
    )

    assert response.status_code == 403


def test_authenticated_user_can_list_and_view_file_checks(test_client, test_db):
    _create_file_check_user(test_db, "filecheck-admin-list", "admin")
    _create_file_check_user(test_db, "filecheck-viewer-list", "viewer")
    create_response = test_client.post(
        "/api/file-checks",
        files={"file": ("vendors.csv", b"Code,Name\n001,\n", "text/csv")},
        headers=_file_check_auth_header("filecheck-admin-list"),
    )
    assert create_response.status_code == 201
    report_id = create_response.json()["id"]

    list_response = test_client.get(
        "/api/file-checks",
        headers=_file_check_auth_header("filecheck-viewer-list"),
    )
    detail_response = test_client.get(
        f"/api/file-checks/{report_id}",
        headers=_file_check_auth_header("filecheck-viewer-list"),
    )

    assert list_response.status_code == 200
    assert list_response.json()["total"] == 1
    assert list_response.json()["items"][0]["id"] == report_id
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["id"] == report_id
    assert detail["issue_total"] == 1
    assert detail["issues"][0]["issue_type"] == "missing_value"


def test_file_check_rejects_unsupported_extension(test_client, test_db):
    _create_file_check_user(test_db, "filecheck-admin-xlsx", "admin")

    response = test_client.post(
        "/api/file-checks",
        files={
            "file": (
                "vendors.xlsx",
                b"not really a spreadsheet",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
        headers=_file_check_auth_header("filecheck-admin-xlsx"),
    )

    assert response.status_code == 400
    assert "csv or tsv" in response.json()["detail"].lower()
