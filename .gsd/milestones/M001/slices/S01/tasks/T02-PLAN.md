# T02: 01-foundation-ingestion-pipeline 02

**Slice:** S01 — **Milestone:** M001

## Description

Build the complete ingestion pipeline backend: CSV parsing, data source CRUD, file upload, name normalization, embedding computation, re-upload supersession, and Celery task orchestration with progress tracking.

Purpose: This is the core data pipeline that processes supplier CSV exports from raw files into normalized, embedded staging records. Without this, there's no data to match or review.
Output: Working API endpoints for data source management and file upload, Celery worker that processes uploads through the full pipeline (parse → map → store → normalize → embed), re-upload lifecycle with supersession, and a matching stub task.

## Must-Haves

- [ ] "User can POST /api/sources to create a data source with column mapping JSON"
- [ ] "User can GET/PUT/DELETE /api/sources to manage data sources"
- [ ] "User can POST /api/import/upload with a CSV file and data_source_id, receiving a batch_id and Celery task_id"
- [ ] "Celery worker parses CSV with BOM stripping, semicolon delimiter, whitespace trimming"
- [ ] "Worker normalizes supplier names (uppercase, remove legal suffixes, collapse spaces) and stores both raw and normalized names"
- [ ] "Worker computes 384-dim embeddings for normalized names using all-MiniLM-L6-v2"
- [ ] "Staged suppliers store raw JSONB data alongside extracted key fields"
- [ ] "Re-upload marks old staged records as superseded and invalidates pending match candidates"
- [ ] "Matching task is auto-enqueued after ingestion completes (stub in Phase 1)"
- [ ] "User can GET /api/import/batches/{task_id}/status to poll Celery task progress"

## Files

- `backend/app/utils/csv_parser.py`
- `backend/app/services/normalization.py`
- `backend/app/services/embedding.py`
- `backend/app/services/source.py`
- `backend/app/services/ingestion.py`
- `backend/app/routers/sources.py`
- `backend/app/routers/upload.py`
- `backend/app/schemas/source.py`
- `backend/app/schemas/upload.py`
- `backend/app/tasks/ingestion.py`
- `backend/app/tasks/matching.py`
- `backend/tests/test_csv_parser.py`
- `backend/tests/test_normalization.py`
- `backend/tests/test_embedding.py`
- `backend/tests/test_sources.py`
- `backend/tests/test_upload.py`
- `backend/tests/test_reupload.py`
- `backend/tests/test_ingestion_task.py`
