# Upload-First Flow Redesign

**Date:** 2026-03-22
**Status:** Approved

## Problem

The current Upload page requires users to select or create a DataSource before dropping a CSV file. This adds friction — especially for first-time users who don't understand what a "source" is or why it's needed. The file upload should be the primary action.

## Design

### New Flow

```
DROP_FILE → DETECTING → MATCHED (single high-confidence match) → CONFIRM_SOURCE → PROCESSING
                      → AMBIGUOUS (0 or 2+ matches)           → PICK_SOURCE   → PROCESSING
                      → (user picks "create new")             → MAP_COLUMNS   → PROCESSING

PICK_SOURCE → (user selects existing) → re-upload check → PROCESSING
PICK_SOURCE → (user picks "create new") → MAP_COLUMNS → PROCESSING

Any state → (error) → DROP_FILE with error message displayed
```

**Old flow:** Select source → Drop file → (map columns) → Upload → Process
**New flow:** Drop file → Auto-detect source → Confirm/pick/create → Upload → Process

### Source Matching Algorithm

Runs server-side after file drop. Determines which existing DataSource (if any) the CSV belongs to.

1. **Delimiter auto-detection** — Use Python's `csv.Sniffer().sniff()` on the first 8KB of the file to detect the delimiter. Fall back to `;` if sniffing fails. This is needed because the file has no source context yet.
2. **Column gate** — Detect columns using the sniffed delimiter. Filter to sources whose non-null `column_mapping` values are all present in the CSV's detected headers. (Skip `None`-valued optional fields when computing the subset check.)
3. **Filename pattern** — If a source has a `filename_pattern`, check the uploaded filename. Boost score for matches. Patterns are validated on save and executed with a 100ms timeout to prevent ReDoS.
4. **Data sampling** — Sample ~20 rows from the CSV. For each candidate source, use the source's `column_mapping["supplier_code"]` to locate the right CSV column, extract those values, then query `StagedSupplier.source_code` for that source to count overlaps. Rank by overlap percentage.
5. **Result** — Return sources sorted by confidence. Flag a `suggested_source_id` only if the top match is clearly dominant (e.g., >50% code overlap and >2x the next candidate's overlap).

### Backend Changes

#### New endpoint: `POST /api/sources/match-source`

Accepts the CSV file (with filename), returns ranked source matches. This endpoint is `async def` (uses `await file.read()`), requires a DB session dependency, and enforces the same 50MB size limit as the upload endpoint.

The file is saved to disk during detection and a `file_ref` token (the stored filename) is returned. The upload endpoint is extended to accept an optional `file_ref` parameter as an alternative to `file`, avoiding double-upload for large files.

**Request:** `multipart/form-data { file: CSV }`

**Response:**
```json
{
  "filename": "suppliers_q1_2026.csv",
  "file_ref": "abc123_suppliers_q1_2026.csv",
  "detected_columns": ["name", "code", "currency"],
  "matches": [
    {
      "source_id": 3,
      "source_name": "SAP Vendor Export",
      "column_match": true,
      "filename_match": true,
      "data_overlap_pct": 0.85,
      "sample_size": 20,
      "confidence": "high"
    }
  ],
  "suggested_source_id": 3,
  "suggested_name": "Suppliers Q1 2026"
}
```

The `suggested_name` is generated server-side by: stripping the file extension, replacing underscores/hyphens with spaces, and title-casing the result. E.g., `suppliers_q1_2026.csv` → `"Suppliers Q1 2026"`.

**Logic:**
1. Read file, validate size (50MB limit) and UTF-8 encoding
2. Auto-detect delimiter using `csv.Sniffer` on first 8KB
3. Detect columns using the sniffed delimiter
4. Save file to `data/uploads/` with a UUID prefix (same pattern as upload endpoint), return as `file_ref`
5. Query all DataSources, filter to those whose non-null `column_mapping` values are a subset of detected columns
6. For each candidate, check `filename_pattern` (with timeout)
7. For each candidate, sample 20 rows from CSV, use `column_mapping["supplier_code"]` to find the CSV column containing supplier codes, query `StagedSupplier.source_code` for that source to count overlaps
8. Rank by: filename match (boolean boost) + data overlap percentage
9. Generate `suggested_name` from filename
10. Set `suggested_source_id` only if top match has "high" confidence and clear separation from second match

**Confidence levels:**
- `high` — filename matches AND >50% data overlap, OR >80% data overlap alone
- `medium` — column match + some data overlap (10-50%) or filename match alone
- `low` — column match only, no data overlap, no filename match

#### Upload endpoint change: `POST /api/import/upload`

Add optional `file_ref: str = Form(None)` parameter. If provided (and `file` is not), load the file from `data/uploads/{file_ref}` instead of reading from the upload. This avoids re-transmitting large files that were already saved during match-source detection.

#### DataSource model change

Add optional `filename_pattern` column:
```python
filename_pattern: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
```

Stores a regex pattern for matching upload filenames. Set via Sources page. Not required — only used as a boost signal.

**Validation:** On save (create/update), validate the pattern with `re.compile()`. Reject invalid patterns with a 400 error.

**Execution safety:** When matching, execute `re.search()` with a 100ms timeout (via `signal.alarm` or `concurrent.futures` with timeout) to prevent ReDoS from catastrophic backtracking patterns.

**Requires Alembic migration** to add the nullable column.

#### Schema changes

- `DataSourceCreate` / `DataSourceUpdate` — add optional `filename_pattern: str | None`
- `DataSourceResponse` — add `filename_pattern: str | None`
- New schemas: `SourceMatchResult` (per-source match), `SourceMatchResponse` (full response)

### Frontend Changes

#### Upload.tsx — New state machine

```typescript
type UploadState =
  | { step: 'DROP_FILE' }
  | { step: 'DETECTING'; file: File }
  | { step: 'MATCHED'; file: File; fileRef: string; match: SourceMatch; allMatches: SourceMatch[] }
  | { step: 'PICK_SOURCE'; file: File; fileRef: string; matches: SourceMatch[]; columns: string[] }
  | { step: 'MAP_COLUMNS'; file: File; fileRef: string; columns: string[]; suggestedName: string }
  | { step: 'PROCESSING'; taskId: string }
```

Re-upload dialog remains a side-channel boolean (`showReUpload` state) outside the state machine, same as the current implementation.

#### UI States

1. **DROP_FILE** — Drop zone is the hero. No source picker. This is the landing state.
2. **DETECTING** — Spinner: "Analyzing your file..." while calling `POST /api/sources/match-source`. On error (network, server, validation), return to DROP_FILE with error message displayed.
3. **MATCHED** — Card: "This looks like **SAP Vendor Export**" with source details (mapped columns, last upload date). Two actions: "Confirm & Upload" / "Choose different source." Confirm triggers re-upload check if the source has existing batches, then uploads using `file_ref`. "Choose different" transitions to PICK_SOURCE.
4. **PICK_SOURCE** — List of compatible sources ranked by confidence with match indicators (column match, filename match, data overlap %). "Create new source" option at the bottom. Selecting existing → re-upload check → upload using `file_ref`. Selecting "create new" → MAP_COLUMNS.
5. **MAP_COLUMNS** — Existing ColumnMapper component, with a new optional `initialSourceName` prop for pre-filling the name from the server's `suggested_name`. User can edit but doesn't have to.
6. **PROCESSING** — Existing ProgressTracker, unchanged.

#### Component changes

- **ColumnMapper** — Add optional `initialSourceName?: string` prop. Initialize `sourceName` state with this value instead of empty string.
- **BatchHistory** — Make `dataSourceId` prop optional. When omitted, fetch all batches across sources (`/api/import/batches` without filter). The Sources page continues to pass `dataSourceId` as before.

#### Sources page

Unchanged except: add `filename_pattern` field to the SourceModal form (text input with "Regex pattern for matching filenames" placeholder).

### Re-upload & Edge Cases

**Re-upload detection** — Same logic as today. Triggered when user confirms a source (in MATCHED or PICK_SOURCE state) that has existing batches. Shows ReUploadDialog before proceeding.

**Edge cases:**
- **Empty CSV / no headers** — Error at DETECTING, return to DROP_FILE with error message
- **Server error / timeout during detection** — Return to DROP_FILE with error message
- **CSV columns match zero sources** — Go to PICK_SOURCE with empty matches list; "Create new source" is the primary action
- **First-ever upload (no sources exist)** — Skip PICK_SOURCE, go directly to MAP_COLUMNS with auto-generated name
- **Large file sampling** — 20-row sample is read from file bytes already in memory from column detection. No extra file read.
- **Filename pattern not set** — Optional field. Most sources won't have one initially. Only used as a boost signal.
- **Delimiter mismatch** — Auto-detected via `csv.Sniffer`. If detection fails, falls back to `;` (existing default).

### What's NOT changing

- **Sources page** — Still exists for CRUD, editing mappings, setting filename patterns
- **Upload endpoint** — `POST /api/import/upload` keeps the same interface (adds optional `file_ref` but existing callers are unaffected)
- **Ingestion pipeline** — Untouched
- **ReUploadDialog** — Reused as-is
- **ProgressTracker** — Reused as-is
