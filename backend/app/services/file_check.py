"""Pure file content analysis for standalone file checks."""

import csv
import io
from dataclasses import dataclass, field
from typing import Protocol

from app.models.enums import FileCheckIssueType, FileCheckSeverity, FileCheckStatus

CRITERIA_VERSION = "v1"
MAX_VALUE_PREVIEW = 255
NAME_COLUMN_SYNONYMS = (
    "Name",
    "Supplier Name",
    "BPSNAM_0",
    "supplier_name",
    "vendor_name",
    "nom_fournisseur",
    "raison_sociale",
)


class FileCheckIssueLike(Protocol):
    row_number: int
    issue_type: str


@dataclass(frozen=True)
class FileCheckIssueSummary:
    rows_with_issues: int
    empty_row_count: int
    missing_value_count: int
    corrupted_value_count: int
    stored_issue_count: int
    issue_cap_reached: bool


@dataclass(frozen=True)
class FileCheckCriteria:
    required_columns: tuple[str, ...] = ("Name",)


@dataclass(frozen=True)
class FileCheckIssueData:
    row_number: int
    column_name: str | None
    issue_type: FileCheckIssueType
    severity: FileCheckSeverity
    value_preview: str | None
    message: str


@dataclass(frozen=True)
class FileCheckAnalysis:
    delimiter: str
    status: FileCheckStatus
    total_rows: int
    rows_with_issues: int
    empty_row_count: int
    missing_value_count: int
    corrupted_value_count: int
    stored_issue_count: int
    issue_cap_reached: bool
    criteria_version: str
    issues: list[FileCheckIssueData] = field(default_factory=list)


def summarize_file_check_issues(
    issues: list[FileCheckIssueLike],
    issue_cap: int,
) -> FileCheckIssueSummary:
    rows_with_issue_numbers = {issue.row_number for issue in issues}
    empty_row_count = _count_issue_type(issues, FileCheckIssueType.EMPTY_ROW)
    missing_value_count = _count_issue_type(issues, FileCheckIssueType.MISSING_VALUE)
    corrupted_value_count = _count_issue_type(issues, FileCheckIssueType.CORRUPTED_VALUE)

    return FileCheckIssueSummary(
        rows_with_issues=len(rows_with_issue_numbers),
        empty_row_count=empty_row_count,
        missing_value_count=missing_value_count,
        corrupted_value_count=corrupted_value_count,
        stored_issue_count=len(issues),
        issue_cap_reached=len(issues) >= issue_cap,
    )


def decode_file_content(file_content: bytes) -> str:
    try:
        return file_content.decode("utf-8-sig")
    except UnicodeDecodeError:
        return file_content.decode("cp1252")


def detect_delimiter(text: str, filename: str) -> str:
    if filename.lower().endswith(".tsv"):
        return "\t"

    try:
        dialect = csv.Sniffer().sniff(text[:8192], delimiters=",;\t|")
    except csv.Error:
        return _fallback_delimiter(text)

    return dialect.delimiter


def analyze_file_content(
    file_content: bytes,
    filename: str,
    criteria: FileCheckCriteria | None = None,
    issue_cap: int = 5000,
) -> FileCheckAnalysis:
    criteria = criteria or FileCheckCriteria()
    text = decode_file_content(file_content)
    delimiter = detect_delimiter(text, filename)
    reader = csv.reader(io.StringIO(text), delimiter=delimiter, quotechar='"')
    headers = next(reader, None)

    if not headers:
        return FileCheckAnalysis(
            delimiter=delimiter,
            status=FileCheckStatus.ERROR,
            total_rows=0,
            rows_with_issues=0,
            empty_row_count=0,
            missing_value_count=0,
            corrupted_value_count=0,
            stored_issue_count=0,
            issue_cap_reached=False,
            criteria_version=CRITERIA_VERSION,
            issues=[],
        )

    issues: list[FileCheckIssueData] = []
    rows_with_issue_numbers: set[int] = set()
    total_rows = 0
    empty_row_count = 0
    missing_value_count = 0
    corrupted_value_count = 0
    issue_cap_reached = False
    required_columns = _resolve_required_columns(headers, criteria.required_columns)

    def store_issue(issue: FileCheckIssueData) -> None:
        nonlocal issue_cap_reached
        if len(issues) < issue_cap:
            issues.append(issue)
        else:
            issue_cap_reached = True

    for row_number, parsed_row in enumerate(reader, start=2):
        total_rows += 1
        row = _row_to_dict(headers, parsed_row)

        if all(_is_blank(value) for value in parsed_row):
            empty_row_count += 1
            rows_with_issue_numbers.add(row_number)
            store_issue(
                FileCheckIssueData(
                    row_number=row_number,
                    column_name=None,
                    issue_type=FileCheckIssueType.EMPTY_ROW,
                    severity=FileCheckSeverity.ERROR,
                    value_preview=None,
                    message="Entire row is empty",
                )
            )
            continue

        for column_name in required_columns:
            value = row.get(column_name)
            if _is_blank(value):
                missing_value_count += 1
                rows_with_issue_numbers.add(row_number)
                store_issue(
                    FileCheckIssueData(
                        row_number=row_number,
                        column_name=column_name,
                        issue_type=FileCheckIssueType.MISSING_VALUE,
                        severity=FileCheckSeverity.ERROR,
                        value_preview=_preview_value(value),
                        message="Required value is missing",
                    )
                )

    has_findings = empty_row_count > 0 or missing_value_count > 0 or corrupted_value_count > 0

    return FileCheckAnalysis(
        delimiter=delimiter,
        status=FileCheckStatus.FAILED if has_findings else FileCheckStatus.CLEAN,
        total_rows=total_rows,
        rows_with_issues=len(rows_with_issue_numbers),
        empty_row_count=empty_row_count,
        missing_value_count=missing_value_count,
        corrupted_value_count=corrupted_value_count,
        stored_issue_count=len(issues),
        issue_cap_reached=issue_cap_reached,
        criteria_version=CRITERIA_VERSION,
        issues=issues,
    )


def _is_blank(value: str | None) -> bool:
    return value is None or value.strip() == ""


def _resolve_required_columns(headers: list[str], required_columns: tuple[str, ...]) -> tuple[str, ...]:
    resolved: list[str] = []
    normalized_headers = {_normalize_header(header): header for header in headers}

    for column_name in required_columns:
        candidates = NAME_COLUMN_SYNONYMS if _normalize_header(column_name) == "name" else (column_name,)
        match = next(
            (normalized_headers[key] for key in map(_normalize_header, candidates) if key in normalized_headers),
            None,
        )
        resolved.append(match or column_name)

    return tuple(resolved)


def _normalize_header(value: str) -> str:
    return value.strip().lower()


def _fallback_delimiter(text: str) -> str:
    for line in text.splitlines():
        if line.strip() == "":
            continue

        delimiter_counts = {delimiter: line.count(delimiter) for delimiter in (",", ";", "\t", "|")}
        delimiter, count = max(delimiter_counts.items(), key=lambda item: item[1])
        if count > 0:
            return delimiter

        break

    return ","


def _row_to_dict(headers: list[str], parsed_row: list[str]) -> dict[str, str]:
    values = [*parsed_row[: len(headers)], *[""] * max(len(headers) - len(parsed_row), 0)]
    return dict(zip(headers, values, strict=True))


def _preview_value(value: str | None) -> str | None:
    if value is None:
        return None

    return value[:MAX_VALUE_PREVIEW]


def _count_issue_type(issues: list[FileCheckIssueLike], issue_type: FileCheckIssueType) -> int:
    return sum(1 for issue in issues if issue.issue_type == issue_type)
