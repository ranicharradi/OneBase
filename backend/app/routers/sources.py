"""Data source CRUD endpoints."""

import csv
import io
import os
import re
import uuid
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeoutError
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.models.enums import SupplierStatus
from app.models.staging import StagedSupplier
from app.models.user import User
from app.schemas.source import (
    ColumnDetectResponse,
    DataSourceCreate,
    DataSourceResponse,
    DataSourceUpdate,
    FieldGuess,
    GuessMappingResponse,
    SourceMatchResponse,
    SourceMatchResult,
)
from app.services.audit import log_action
from app.services.column_guesser import guess_column_mapping
from app.services.source import (
    create_source,
    delete_source,
    get_source,
    get_sources,
    update_source,
)
from app.utils.csv_parser import detect_columns

UPLOAD_DIR = os.path.join("data", "uploads")
MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50 MB
SAMPLE_ROWS = 20
FILENAME_PATTERN_TIMEOUT = 0.1  # 100ms

router = APIRouter(prefix="/api/sources", tags=["sources"])


@router.post("", response_model=DataSourceResponse, status_code=status.HTTP_201_CREATED)
def create_data_source(
    data: DataSourceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new data source with column mapping."""
    try:
        source = create_source(db, data)
        log_action(
            db,
            user_id=current_user.id,
            action="create_source",
            entity_type="data_source",
            entity_id=source.id,
            details={"name": source.name},
        )
        db.commit()
        db.refresh(source)
        return source
    except ValueError as e:
        err_msg = str(e)
        if "already exists" in err_msg:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=err_msg) from e
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err_msg) from e


@router.get("", response_model=list[DataSourceResponse])
def list_data_sources(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all data sources."""
    return get_sources(db)


@router.post("/detect-columns", response_model=ColumnDetectResponse)
async def detect_columns_no_source(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Detect column headers from a CSV file (new source flow, no source yet)."""
    content = await file.read()
    columns = detect_columns(content)
    return ColumnDetectResponse(columns=columns)


def _sniff_delimiter(text: str) -> str:
    """Auto-detect CSV delimiter using csv.Sniffer. Falls back to ';'."""
    try:
        sample = text[:8192]
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
        return dialect.delimiter
    except csv.Error:
        return ";"


def _detect_columns_from_text(text: str, delimiter: str) -> list[str]:
    """Extract column headers from CSV text."""
    reader = csv.reader(io.StringIO(text), delimiter=delimiter, quotechar='"')
    try:
        headers = next(reader)
        return [h.strip() for h in headers]
    except StopIteration:
        return []


def _sample_rows(text: str, delimiter: str, n: int = SAMPLE_ROWS) -> list[dict[str, str]]:
    """Read up to n data rows from CSV text."""
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter, quotechar='"')
    rows: list[dict[str, str]] = []
    for i, row in enumerate(reader):
        if i >= n:
            break
        rows.append({k.strip(): (v.strip() if v else "") for k, v in row.items()})
    return rows


def _check_filename_pattern(pattern: str, filename: str) -> bool:
    """Check filename against a regex pattern with a timeout to prevent ReDoS."""

    def _match():
        return bool(re.search(pattern, filename))

    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(_match)
        try:
            return future.result(timeout=FILENAME_PATTERN_TIMEOUT)
        except (FuturesTimeoutError, re.error):
            return False


def _generate_suggested_name(filename: str) -> str:
    """Generate a human-friendly name from a filename."""
    name = Path(filename).stem
    name = name.replace("_", " ").replace("-", " ")
    return name.title()


@router.post("/match-source", response_model=SourceMatchResponse)
async def match_source(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Analyze a CSV file and match it against existing data sources.

    Returns ranked matches with confidence levels and saves the file
    for later use via file_ref in the upload endpoint.
    """
    # Validate filename
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .csv files are accepted",
        )

    # Read and validate size
    file_content = await file.read()
    if len(file_content) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {MAX_UPLOAD_SIZE // (1024 * 1024)} MB",
        )

    # Validate UTF-8
    try:
        text = file_content.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = file_content.decode("cp1252")
        except UnicodeDecodeError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File is not valid UTF-8 or Windows-1252 encoded.",
            ) from None

    # Auto-detect delimiter
    delimiter = _sniff_delimiter(text)

    # Detect columns
    detected_columns = _detect_columns_from_text(text, delimiter)
    if not detected_columns:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not detect column headers. File may be empty or malformed.",
        )

    # Save file to disk
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    stored_filename = f"{uuid.uuid4()}_{file.filename}"
    filepath = os.path.join(UPLOAD_DIR, stored_filename)
    with open(filepath, "wb") as f:
        f.write(file_content)

    # Sample rows for data overlap detection
    sample_rows = _sample_rows(text, delimiter)

    # Query all data sources
    all_sources = get_sources(db)
    detected_columns_set = set(detected_columns)

    matches: list[SourceMatchResult] = []

    for source in all_sources:
        col_mapping = source.column_mapping or {}

        # Column gate: check that all non-null mapping values are in detected columns
        required_csv_cols = {v for v in col_mapping.values() if v is not None}
        column_match = required_csv_cols.issubset(detected_columns_set) if required_csv_cols else False

        if not column_match:
            continue

        # Filename pattern check
        filename_match = False
        if source.filename_pattern and file.filename:
            filename_match = _check_filename_pattern(source.filename_pattern, file.filename)

        # Data overlap: sample supplier codes from CSV and compare with DB
        data_overlap_pct = 0.0
        sample_size = len(sample_rows)
        supplier_code_col = col_mapping.get("supplier_code")
        if supplier_code_col and sample_rows:
            csv_codes = {row.get(supplier_code_col, "") for row in sample_rows if row.get(supplier_code_col, "")}
            if csv_codes:
                # Query existing source_codes for this source
                existing_codes = {
                    row[0]
                    for row in db.query(StagedSupplier.source_code)
                    .filter(
                        StagedSupplier.data_source_id == source.id,
                        StagedSupplier.status == SupplierStatus.ACTIVE,
                        StagedSupplier.source_code.in_(csv_codes),
                    )
                    .all()
                    if row[0]
                }
                data_overlap_pct = len(existing_codes) / len(csv_codes) if csv_codes else 0.0

        # Determine confidence
        if (filename_match and data_overlap_pct > 0.5) or data_overlap_pct > 0.8:
            confidence = "high"
        elif (data_overlap_pct >= 0.1) or filename_match:
            confidence = "medium"
        else:
            confidence = "low"

        matches.append(
            SourceMatchResult(
                source_id=source.id,
                source_name=source.name,
                column_match=column_match,
                filename_match=filename_match,
                data_overlap_pct=round(data_overlap_pct, 4),
                sample_size=sample_size,
                confidence=confidence,
            )
        )

    # Sort: high > medium > low, then by data_overlap_pct desc, filename_match desc
    confidence_order = {"high": 0, "medium": 1, "low": 2}
    matches.sort(key=lambda m: (confidence_order[m.confidence], -m.data_overlap_pct, not m.filename_match))

    # Determine suggested_source_id
    suggested_source_id = None
    if matches:
        top = matches[0]
        if top.confidence == "high" and (len(matches) == 1 or top.data_overlap_pct > 2 * matches[1].data_overlap_pct):
            suggested_source_id = top.source_id

    return SourceMatchResponse(
        filename=file.filename or "unknown.csv",
        file_ref=stored_filename,
        detected_columns=detected_columns,
        detected_delimiter=delimiter,
        matches=matches,
        suggested_source_id=suggested_source_id,
        suggested_name=_generate_suggested_name(file.filename or "upload"),
    )


@router.post("/guess-mapping", response_model=GuessMappingResponse)
async def guess_mapping(
    file: UploadFile = File(None),
    file_ref: str | None = Form(None),
    current_user: User = Depends(get_current_user),
):
    """Guess column mapping by analyzing CSV data values.

    Accepts either a file upload or a file_ref from a previous match-source call.
    Samples rows and uses heuristic classifiers to guess which CSV column
    maps to each canonical field.
    """
    if file_ref:
        filepath = os.path.join(UPLOAD_DIR, file_ref)
        if not os.path.exists(filepath):
            raise HTTPException(status_code=404, detail="File reference not found")
        with open(filepath, "rb") as f:
            file_content = f.read()
    elif file:
        file_content = await file.read()
    else:
        raise HTTPException(status_code=400, detail="Either file or file_ref is required")

    try:
        text = file_content.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = file_content.decode("cp1252")
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="File encoding not supported") from None

    delimiter = _sniff_delimiter(text)
    columns = _detect_columns_from_text(text, delimiter)
    if not columns:
        raise HTTPException(status_code=400, detail="No columns detected")

    sample = _sample_rows(text, delimiter, n=100)
    if not sample:
        raise HTTPException(status_code=400, detail="No data rows found")

    guesses = guess_column_mapping(columns, sample)

    return GuessMappingResponse(
        supplier_name=FieldGuess(**guesses["supplier_name"]),
        supplier_code=FieldGuess(**guesses["supplier_code"]),
        short_name=FieldGuess(**guesses["short_name"]),
        currency=FieldGuess(**guesses["currency"]),
        payment_terms=FieldGuess(**guesses["payment_terms"]),
        contact_name=FieldGuess(**guesses["contact_name"]),
        supplier_type=FieldGuess(**guesses["supplier_type"]),
    )


@router.get("/{source_id}", response_model=DataSourceResponse)
def get_data_source(
    source_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single data source by ID."""
    source = get_source(db, source_id)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Data source not found")
    return source


@router.put("/{source_id}", response_model=DataSourceResponse)
def update_data_source(
    source_id: int,
    data: DataSourceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a data source."""
    try:
        source = update_source(db, source_id, data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Data source not found")
    log_action(
        db,
        user_id=current_user.id,
        action="update_source",
        entity_type="data_source",
        entity_id=source.id,
        details={"name": source.name},
    )
    db.commit()
    db.refresh(source)
    return source


@router.delete("/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_data_source(
    source_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a data source."""
    deleted = delete_source(db, source_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Data source not found")
    log_action(
        db,
        user_id=current_user.id,
        action="delete_source",
        entity_type="data_source",
        entity_id=source_id,
    )
    db.commit()


@router.post("/{source_id}/detect-columns", response_model=ColumnDetectResponse)
async def detect_source_columns(
    source_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Detect column headers from an uploaded CSV file."""
    source = get_source(db, source_id)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Data source not found")
    content = await file.read()
    columns = detect_columns(content, delimiter=source.delimiter)
    return ColumnDetectResponse(columns=columns)
