---
phase: 01-foundation-ingestion-pipeline
plan: 02
subsystem: api, ingestion
tags: [fastapi, celery, csv-parsing, normalization, embedding, sentence-transformers, pydantic-v2]

# Dependency graph
requires:
  - phase: 01-foundation-ingestion-pipeline (plan 01)
    provides: "SQLAlchemy models (DataSource, ImportBatch, StagedSupplier, MatchCandidate), database session, JWT auth, audit trail"
provides:
  - "CSV parser with BOM handling, semicolon delimiter, Windows-1252 fallback"
  - "Name normalization with 24 legal suffix removal, accent stripping, uppercase"
  - "Embedding service with lazy-loaded all-MiniLM-L6-v2 producing 384-dim L2-normalized vectors"
  - "Data source CRUD endpoints (POST/GET/PUT/DELETE /api/sources)"
  - "File upload endpoint (POST /api/import/upload) with batch creation and Celery dispatch"
  - "Ingestion orchestration service: parse → map → supersede → store → normalize → embed → finalize"
  - "Re-upload supersession: old records marked superseded, pending matches invalidated"
  - "Celery process_upload task with progress stages (PARSING, NORMALIZING, EMBEDDING, COMPLETE)"
  - "Matching stub task auto-enqueued after ingestion"
  - "Batch list and task status polling endpoints"
affects: [02-matching-engine, 03-review-merge-ui]

# Tech tracking
tech-stack:
  added: [celery, sentence-transformers, numpy]
  patterns: [service-layer-pattern, TDD-red-green-refactor, column-mapping-driven-ingestion, lazy-model-loading]

key-files:
  created:
    - backend/app/utils/csv_parser.py
    - backend/app/services/normalization.py
    - backend/app/services/embedding.py
    - backend/app/services/source.py
    - backend/app/services/ingestion.py
    - backend/app/schemas/source.py
    - backend/app/schemas/upload.py
    - backend/app/routers/sources.py
    - backend/app/routers/upload.py
    - backend/app/tasks/ingestion.py
    - backend/app/tasks/matching.py
    - backend/tests/test_csv_parser.py
    - backend/tests/test_normalization.py
    - backend/tests/test_embedding.py
    - backend/tests/test_sources.py
    - backend/tests/test_upload.py
    - backend/tests/test_reupload.py
    - backend/tests/test_ingestion_task.py
  modified:
    - backend/app/main.py

key-decisions:
  - "Mock embedding model in tests — sentence-transformers not available in test env, tests mock compute_embeddings/get_embedding_model"
  - "Column mapping stored as JSON dict on DataSource — maps logical fields (supplier_name, supplier_code) to CSV column headers"
  - "Re-upload supersedes ALL active records for a data source, not just changed ones — simpler, avoids diff complexity"
  - "Embeddings stored as JSON-serializable lists in SQLite tests; production uses pgvector Vector(384)"

patterns-established:
  - "Service layer pattern: routers delegate to services (source.py, ingestion.py), services handle business logic"
  - "TDD red-green-refactor: tests written first, then minimal implementation, verified passing"
  - "Mocked Celery tasks in endpoint tests: patch process_upload.delay to avoid broker dependency"
  - "Progress callback pattern: ingestion service accepts optional callback, Celery task maps to update_state"

requirements-completed: [INGS-01, INGS-02, INGS-03, INGS-04, INGS-05, INGS-06, INGS-07, INGS-08, OPS-02]

# Metrics
duration: 9min
completed: 2026-03-13
---

# Plan 02: Ingestion Pipeline Summary

**CSV parsing with BOM/cp1252 fallback, name normalization with 24 legal suffixes, 384-dim embeddings, data source CRUD, file upload with Celery-orchestrated pipeline, and re-upload supersession**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-13T18:49:47Z
- **Completed:** 2026-03-13T18:58:53Z
- **Tasks:** 2 (both TDD: 4 commits total)
- **Files modified:** 19 (18 created, 1 modified)

## Accomplishments
- Complete ingestion pipeline: CSV parse → column map → supersede → store → normalize → embed → finalize
- Data source CRUD with column mapping validation (supplier_name and supplier_code required)
- File upload endpoint creates ImportBatch, saves CSV, dispatches Celery task with progress tracking
- Re-upload supersedes old active records and invalidates pending match candidates (preserves confirmed)
- 70 tests passing (57 new in this plan + 13 from plan 01)

## Task Commits

Each task was committed atomically (TDD: test → feat):

1. **Task 1: CSV parser + Name normalization + Embedding service + Data source CRUD**
   - `6cebbce` (test) — 40 failing tests across 4 test files
   - `fe38cf6` (feat) — All implementations, 40 tests passing (53 total)

2. **Task 2: Upload endpoint + Celery ingestion task + Re-upload supersession + Matching stub**
   - `208acae` (test) — 17 failing tests across 3 test files + upload schema
   - `a5edf0e` (feat) — Ingestion service, upload router, Celery tasks, 70 tests passing

## Files Created/Modified

- `backend/app/utils/csv_parser.py` — CSV parsing with BOM stripping, semicolon delimiter, cp1252 fallback
- `backend/app/services/normalization.py` — Name normalization: uppercase, 24 legal suffixes, accent strip, space collapse
- `backend/app/services/embedding.py` — Lazy-loaded all-MiniLM-L6-v2 producing 384-dim L2-normalized embeddings
- `backend/app/services/source.py` — Data source CRUD service (create, get, update, delete)
- `backend/app/services/ingestion.py` — Full ingestion orchestration with progress callbacks
- `backend/app/schemas/source.py` — Pydantic v2 schemas for DataSource with ColumnMapping validation
- `backend/app/schemas/upload.py` — Upload, batch, and task status response schemas
- `backend/app/routers/sources.py` — CRUD endpoints at /api/sources with audit logging
- `backend/app/routers/upload.py` — Upload, batch list, and task status endpoints at /api/import
- `backend/app/tasks/ingestion.py` — Celery process_upload task with progress via update_state
- `backend/app/tasks/matching.py` — Matching stub task (Phase 2 placeholder)
- `backend/app/main.py` — Added sources and upload routers
- `backend/tests/test_csv_parser.py` — 10 tests: BOM, semicolons, whitespace, cp1252, empty, quoted, detect_columns
- `backend/tests/test_normalization.py` — 16 tests: uppercase, 10 suffix types, spaces, empty, None, accents
- `backend/tests/test_embedding.py` — 3 tests: shape, empty input, L2 normalization (mocked model)
- `backend/tests/test_sources.py` — 11 tests: full CRUD cycle, duplicate name, auth, detect-columns
- `backend/tests/test_upload.py` — 6 tests: upload creates batch, invalid source, auth, batches list, status, audit
- `backend/tests/test_reupload.py` — 4 tests: first upload active, supersession, invalidate pending, preserve confirmed
- `backend/tests/test_ingestion_task.py` — 7 tests: raw_data, normalize, embed, batch status, progress, error, matching stub

## Decisions Made

- **Mock embedding model in tests:** sentence-transformers not installed in test environment; all embedding tests mock `compute_embeddings` or `get_embedding_model` — ensures tests run fast without GPU/model download
- **Column mapping as JSON dict:** DataSource stores `column_mapping` as `{"supplier_name": "Name1", "supplier_code": "VendorCode"}` — maps logical field names to actual CSV column headers, making the system agnostic to CSV column naming
- **Full supersession on re-upload:** When re-uploading to the same data source, ALL existing active records are superseded (not just changed ones) — simpler logic, avoids complex diffing, matches "replace the full export" mental model
- **Installed Celery in test environment:** `celery` package was missing from test env, causing import failures — installed via `pip3 install --user --break-system-packages celery` (Deviation Rule 3: blocking issue)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing celery dependency in test environment**
- **Found during:** Task 2 GREEN phase (running tests)
- **Issue:** `from celery import Celery` in `celery_app.py` failed with `ModuleNotFoundError: No module named 'celery'` — upload router imports cascade through `celery_app`
- **Fix:** Installed celery with `pip3 install --user --break-system-packages celery`
- **Files modified:** None (system package install)
- **Verification:** All 70 tests pass after installation
- **Committed in:** Part of `a5edf0e` (Task 2 GREEN)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Celery is a core dependency listed in requirements.txt; the fix was installing it in the local test environment. No scope creep.

## Issues Encountered

- **`python` command not available:** System only has `python3`; all commands use `python3 -m pytest`
- **`sentence-transformers` not installed:** Embedding tests use mocks instead of real model — consistent with test isolation principles

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All ingestion pipeline services and endpoints are complete and tested
- Phase 1 Plan 03 (if any) or Phase 2 (matching engine) can build on these foundations
- Matching stub task (`run_matching`) is ready to be replaced with real matching logic in Phase 2
- Embedding vectors are stored and ready for similarity computation
- Re-upload supersession ensures clean data state for matching

---
*Phase: 01-foundation-ingestion-pipeline*
*Completed: 2026-03-13*

## Self-Check: PASSED

All 18 files verified present. All 4 commit hashes verified in git log.
