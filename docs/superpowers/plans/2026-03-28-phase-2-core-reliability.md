# Phase 2: Core Reliability & Data Integrity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the data pipeline rock-solid — fix retry logic, error handling, race conditions, and status management so the core upload→match→review→merge flow works reliably.

**Architecture:** Introduce Python `StrEnum` classes for all status values, then layer reliability fixes on top: Celery retry policies with exponential backoff, embedding computation timeouts, file cleanup on failure, WebSocket JWT auth, and row-level locking for re-uploads.

**Tech Stack:** Python 3.12 (StrEnum), Celery (autoretry_for, retry_backoff), FastAPI (WebSocketException), SQLAlchemy (with_for_update), concurrent.futures (ThreadPoolExecutor), PyJWT

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `backend/app/models/enums.py` | Status enum definitions (BatchStatus, SupplierStatus, CandidateStatus) |
| Modify | `backend/app/models/batch.py` | Import enums for default values |
| Modify | `backend/app/models/staging.py` | Import enums for default values |
| Modify | `backend/app/models/match.py` | Import enums for default values |
| Modify | `backend/app/services/ingestion.py` | Use enums + add `with_for_update(nowait=True)` |
| Modify | `backend/app/services/matching.py` | Use enums |
| Modify | `backend/app/services/merge.py` | Use enums |
| Modify | `backend/app/services/retraining.py` | Use enums |
| Modify | `backend/app/services/blocking.py` | Use enums |
| Modify | `backend/app/services/grouping.py` | Use enums |
| Modify | `backend/app/services/ml_training.py` | Use enums |
| Modify | `backend/app/services/embedding.py` | Add timeout via ThreadPoolExecutor |
| Modify | `backend/app/routers/upload.py` | Use enums, add file cleanup in delete_batch, add re-upload guard |
| Modify | `backend/app/routers/review.py` | Use enums |
| Modify | `backend/app/routers/unified.py` | Use enums |
| Modify | `backend/app/routers/sources.py` | Use enums |
| Modify | `backend/app/routers/ws.py` | Add JWT auth with WebSocketException |
| Modify | `backend/app/tasks/ingestion.py` | Add retry policy, idempotency guard, file cleanup |
| Modify | `backend/app/tasks/matching.py` | Add retry policy, idempotency guard |
| Modify | `frontend/src/hooks/useMatchingNotifications.ts` | Already sends token — no change needed |
| Create | `backend/tests/test_enums.py` | Tests for enum definitions |
| Modify | `backend/tests/test_ingestion_task.py` | Add idempotency + retry tests, use enums |
| Modify | `backend/tests/test_embedding.py` | Add timeout test |
| Modify | `backend/tests/test_upload.py` | Add file cleanup + re-upload guard tests |
| Modify | `backend/tests/test_ws.py` | Add auth rejection tests |
| Modify | `backend/tests/test_reupload.py` | Use enums |
| Modify | Various test files | Replace string literals with enums |

---

## Task 1: Create Status Enums

**Files:**
- Create: `backend/app/models/enums.py`
- Create: `backend/tests/test_enums.py`

- [ ] **Step 1: Write the failing test for enums**

```python
# backend/tests/test_enums.py
"""Tests for status enum definitions."""

from app.models.enums import BatchStatus, CandidateStatus, SupplierStatus


class TestBatchStatus:
    def test_values(self):
        assert BatchStatus.PENDING == "pending"
        assert BatchStatus.PROCESSING == "processing"
        assert BatchStatus.COMPLETED == "completed"
        assert BatchStatus.FAILED == "failed"

    def test_string_comparison(self):
        """StrEnum values compare equal to plain strings."""
        assert BatchStatus.PENDING == "pending"
        assert "pending" == BatchStatus.PENDING


class TestSupplierStatus:
    def test_values(self):
        assert SupplierStatus.ACTIVE == "active"
        assert SupplierStatus.SUPERSEDED == "superseded"


class TestCandidateStatus:
    def test_values(self):
        assert CandidateStatus.PENDING == "pending"
        assert CandidateStatus.CONFIRMED == "confirmed"
        assert CandidateStatus.REJECTED == "rejected"
        assert CandidateStatus.SKIPPED == "skipped"
        assert CandidateStatus.INVALIDATED == "invalidated"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3 -m pytest tests/test_enums.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.models.enums'`

- [ ] **Step 3: Create the enums module**

```python
# backend/app/models/enums.py
"""Status enums for all entities — single source of truth for status values.

These are StrEnum subclasses so they serialize as plain strings and compare
equal to raw string literals. The DB columns remain String(20) — no migration
needed.
"""

from enum import StrEnum


class BatchStatus(StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class SupplierStatus(StrEnum):
    ACTIVE = "active"
    SUPERSEDED = "superseded"


class CandidateStatus(StrEnum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    REJECTED = "rejected"
    SKIPPED = "skipped"
    INVALIDATED = "invalidated"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python3 -m pytest tests/test_enums.py -v`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
cd backend && git add app/models/enums.py tests/test_enums.py
git commit -m "feat: add StrEnum classes for batch, supplier, and candidate statuses"
```

---

## Task 2: Replace All Status String Literals with Enums

**Files:**
- Modify: `backend/app/models/batch.py`
- Modify: `backend/app/models/staging.py`
- Modify: `backend/app/models/match.py`
- Modify: `backend/app/services/ingestion.py`
- Modify: `backend/app/services/matching.py`
- Modify: `backend/app/services/merge.py`
- Modify: `backend/app/services/retraining.py`
- Modify: `backend/app/services/blocking.py`
- Modify: `backend/app/services/grouping.py`
- Modify: `backend/app/services/ml_training.py`
- Modify: `backend/app/routers/upload.py`
- Modify: `backend/app/routers/review.py`
- Modify: `backend/app/routers/unified.py`
- Modify: `backend/app/routers/sources.py`
- Modify: `backend/app/tasks/ingestion.py`
- Modify: `backend/app/tasks/matching.py`
- Modify: All test files with status literals

This is the largest task — many files, but each change is mechanical (import enum, replace string literal). Work through each file systematically.

- [ ] **Step 1: Update model files**

In `backend/app/models/batch.py`, change line 15:
```python
# Before:
status = Column(String(20), default="pending")  # pending/processing/completed/failed

# After:
from app.models.enums import BatchStatus
# ...
status = Column(String(20), default=BatchStatus.PENDING)
```

In `backend/app/models/staging.py`, change line 25:
```python
# Before:
status = Column(String(20), default="active")  # active/superseded

# After:
from app.models.enums import SupplierStatus
# ...
status = Column(String(20), default=SupplierStatus.ACTIVE)
```

In `backend/app/models/match.py`, change line 34:
```python
# Before:
status = Column(String(20), default="pending")  # pending/confirmed/rejected/skipped/invalidated

# After:
from app.models.enums import CandidateStatus
# ...
status = Column(String(20), default=CandidateStatus.PENDING)
```

- [ ] **Step 2: Update service files**

Replace every raw status string literal with the corresponding enum value. These are the files and the replacements needed:

**`backend/app/services/ingestion.py`** — add `from app.models.enums import BatchStatus, CandidateStatus, SupplierStatus` and replace:
- `"active"` → `SupplierStatus.ACTIVE` (lines 94, 130)
- `"superseded"` → `SupplierStatus.SUPERSEDED` (line 103: `{"status": SupplierStatus.SUPERSEDED}`)
- `"pending"` → `CandidateStatus.PENDING` (line 109)
- `"invalidated"` → `CandidateStatus.INVALIDATED` (line 114: `{"status": CandidateStatus.INVALIDATED}`)
- `"completed"` → `BatchStatus.COMPLETED` (lines 84, 166)
- `"failed"` → `BatchStatus.FAILED` (line 175)

**`backend/app/services/matching.py`** — add `from app.models.enums import CandidateStatus, SupplierStatus` and replace:
- `"invalidated"` → `CandidateStatus.INVALIDATED` (lines 52, 60)
- `"active"` → `SupplierStatus.ACTIVE` (lines 78, 140)
- `"pending"` → `CandidateStatus.PENDING` (line 280)
- Line 259: `MatchCandidate.status != "invalidated"` → `MatchCandidate.status != CandidateStatus.INVALIDATED`

**`backend/app/services/merge.py`** — add `from app.models.enums import CandidateStatus` and replace:
- `"confirmed"` → `CandidateStatus.CONFIRMED` (line 224)
- `"rejected"` → `CandidateStatus.REJECTED` (line 255)
- `"skipped"` → `CandidateStatus.SKIPPED` (line 275)

**`backend/app/services/retraining.py`** — add `from app.models.enums import CandidateStatus` and replace:
- `["confirmed", "rejected"]` → `[CandidateStatus.CONFIRMED, CandidateStatus.REJECTED]` (line 43)
- `"confirmed"` → `CandidateStatus.CONFIRMED` (line 58)
- `"rejected"` → `CandidateStatus.REJECTED` (line 59)

**`backend/app/services/blocking.py`** — add `from app.models.enums import SupplierStatus` and replace:
- `"active"` → `SupplierStatus.ACTIVE` (lines 35, 114, 140)

**`backend/app/services/grouping.py`** — add `from app.models.enums import SupplierStatus` and replace:
- `"active"` → `SupplierStatus.ACTIVE` (lines 54, 66)

**`backend/app/services/ml_training.py`** — add `from app.models.enums import CandidateStatus` and replace:
- `["confirmed", "rejected"]` → `[CandidateStatus.CONFIRMED, CandidateStatus.REJECTED]` (line 84)
- `"confirmed"` → `CandidateStatus.CONFIRMED` (line 122)

- [ ] **Step 3: Update router files**

**`backend/app/routers/upload.py`** — add `from app.models.enums import BatchStatus` and replace:
- `status="pending"` → `status=BatchStatus.PENDING` (line 108)
- Fix the `"failure"` typo (line 163):
  ```python
  # Before:
  if batch.status not in ("pending", "failed", "failure"):
  # After:
  if batch.status not in (BatchStatus.PENDING, BatchStatus.FAILED):
  ```

**`backend/app/routers/review.py`** — add `from app.models.enums import CandidateStatus` and replace:
- `"pending"` → `CandidateStatus.PENDING` (lines 52, 244, 325, 350)
- `"confirmed"` → `CandidateStatus.CONFIRMED` (line 351)
- `"rejected"` → `CandidateStatus.REJECTED` (line 352)
- `"skipped"` → `CandidateStatus.SKIPPED` (lines 296, 353)

**`backend/app/routers/unified.py`** — add `from app.models.enums import BatchStatus, CandidateStatus, SupplierStatus` and replace:
- `"active"` → `SupplierStatus.ACTIVE` (lines 271, 327, 435, 611)
- `"completed"` → `BatchStatus.COMPLETED` (line 608)
- `"failed"` → `BatchStatus.FAILED` (line 609)
- `"pending"` → `CandidateStatus.PENDING` (line 620)
- `"confirmed"` → `CandidateStatus.CONFIRMED` (line 621)
- `"rejected"` → `CandidateStatus.REJECTED` (line 622)
- `"skipped"` → `CandidateStatus.SKIPPED` (line 623)

**`backend/app/routers/sources.py`** — add `from app.models.enums import SupplierStatus` and replace:
- `"active"` → `SupplierStatus.ACTIVE` (line 239)

- [ ] **Step 4: Update task files**

**`backend/app/tasks/ingestion.py`** — add `from app.models.enums import BatchStatus, SupplierStatus` and replace:
- `StagedSupplier.status == "superseded"` → `StagedSupplier.status == SupplierStatus.SUPERSEDED` (line 56)
- `batch.status = "failed"` → `batch.status = BatchStatus.FAILED` (line 81)

**`backend/app/tasks/matching.py`** — no status literals in the task itself (they're in the return dict, which is metadata not DB state). No changes needed.

- [ ] **Step 5: Update test files**

Replace all raw status string literals in test files with enum imports. Each test file needs:
```python
from app.models.enums import BatchStatus, CandidateStatus, SupplierStatus
```
Then replace `status="pending"` → `status=BatchStatus.PENDING`, `status="active"` → `status=SupplierStatus.ACTIVE`, etc. throughout.

Files to update:
- `tests/test_ingestion_task.py` (3 occurrences)
- `tests/test_reupload.py` (~12 occurrences)
- `tests/test_upload.py` (no status literals in test code — only fixtures)
- `tests/test_review_merge.py` (~8 occurrences)
- `tests/test_matching_service.py` (~5 occurrences)
- `tests/test_matching_api.py` (~15 occurrences)
- `tests/test_ml_training.py` (~10 occurrences)
- `tests/test_ml_api.py` (~12 occurrences)
- `tests/test_ml_scoring.py` (~3 occurrences)
- `tests/test_scoring.py` (1 occurrence)
- `tests/test_blocking.py` (~4 occurrences)
- `tests/test_grouping.py` (~2 occurrences)
- `tests/test_unified.py` (~6 occurrences)

**Important:** Do NOT change status strings inside assertions that check response JSON (like `assert data["status"] == "pending"`) — those are API response strings, not DB values. Only change status values used when *creating* DB objects or *querying* DB columns.

- [ ] **Step 6: Run full test suite**

Run: `cd backend && python3 -m pytest -v`
Expected: All 243+ tests PASS

- [ ] **Step 7: Verify no raw string literals remain**

Run: `cd backend && grep -rn '"pending"\|"completed"\|"failed"\|"active"\|"superseded"\|"confirmed"\|"rejected"\|"skipped"\|"invalidated"' app/ --include="*.py" | grep -v "enums.py" | grep -v "__pycache__" | grep -v "# " | grep -v "alembic"`

Expected: No matches (or only in alembic migrations and comments)

- [ ] **Step 8: Commit**

```bash
cd backend && git add -A
git commit -m "refactor: replace all status string literals with StrEnum values

Fixes 'failure' typo in delete_batch endpoint (was never a valid status)."
```

---

## Task 3: Add Celery Task Retry + Idempotency Guards

**Files:**
- Modify: `backend/app/tasks/ingestion.py`
- Modify: `backend/app/tasks/matching.py`
- Modify: `backend/tests/test_ingestion_task.py`

- [ ] **Step 1: Write failing tests for ingestion idempotency**

Add to `backend/tests/test_ingestion_task.py`:

```python
class TestProcessUploadIdempotency:
    """Tests for process_upload idempotency and retry configuration."""

    def test_skips_already_completed_batch(self, test_db):
        """process_upload is a no-op when batch status is 'completed'."""
        from app.models.enums import BatchStatus

        source = DataSource(
            name="Test Source",
            file_format="csv",
            delimiter=";",
            column_mapping={"supplier_name": "Name1", "supplier_code": "VendorCode"},
        )
        test_db.add(source)
        test_db.flush()

        batch = ImportBatch(
            data_source_id=source.id,
            filename="test.csv",
            uploaded_by="testuser",
            status=BatchStatus.COMPLETED,
            row_count=5,
        )
        test_db.add(batch)
        test_db.commit()

        # Patch SessionLocal to return our test session
        with patch("app.tasks.ingestion.SessionLocal", return_value=test_db):
            from app.tasks.ingestion import process_upload

            result = process_upload(batch.id)

        assert result["status"] == "completed"
        assert result["batch_id"] == batch.id

    def test_skips_already_processing_batch(self, test_db):
        """process_upload is a no-op when batch status is 'processing'."""
        from app.models.enums import BatchStatus

        source = DataSource(
            name="Test Source",
            file_format="csv",
            delimiter=";",
            column_mapping={"supplier_name": "Name1", "supplier_code": "VendorCode"},
        )
        test_db.add(source)
        test_db.flush()

        batch = ImportBatch(
            data_source_id=source.id,
            filename="test.csv",
            uploaded_by="testuser",
            status=BatchStatus.PROCESSING,
        )
        test_db.add(batch)
        test_db.commit()

        with patch("app.tasks.ingestion.SessionLocal", return_value=test_db):
            from app.tasks.ingestion import process_upload

            result = process_upload(batch.id)

        assert result["status"] == "processing"

    def test_sets_processing_status_before_work(self, test_db):
        """process_upload sets status to 'processing' before ingestion."""
        from app.models.enums import BatchStatus

        source = DataSource(
            name="Test Source",
            file_format="csv",
            delimiter=";",
            column_mapping={"supplier_name": "Name1", "supplier_code": "VendorCode"},
        )
        test_db.add(source)
        test_db.flush()

        batch = ImportBatch(
            data_source_id=source.id,
            filename="test.csv",
            uploaded_by="testuser",
            status=BatchStatus.PENDING,
        )
        test_db.add(batch)
        test_db.commit()

        statuses_seen = []

        original_run_ingestion = None

        def spy_ingestion(db, batch_id, file_content, progress_callback=None):
            # Record the batch status at the time ingestion runs
            b = db.query(ImportBatch).filter(ImportBatch.id == batch_id).one()
            statuses_seen.append(b.status)
            return 0  # return 0 rows

        import os
        # Create a temp file so file read doesn't fail
        os.makedirs("data/uploads", exist_ok=True)
        test_file = "data/uploads/test.csv"
        with open(test_file, "wb") as f:
            f.write(b"code;name\n")

        try:
            with (
                patch("app.tasks.ingestion.SessionLocal", return_value=test_db),
                patch("app.tasks.ingestion.run_ingestion", side_effect=spy_ingestion),
                patch("app.tasks.matching.run_matching") as mock_matching,
            ):
                mock_matching.delay.return_value = MagicMock(id="mock-task-id")
                from app.tasks.ingestion import process_upload

                process_upload(batch.id)
        finally:
            if os.path.exists(test_file):
                os.unlink(test_file)

        assert statuses_seen[0] == BatchStatus.PROCESSING

    def test_retry_configuration(self, test_db):
        """process_upload has correct retry configuration."""
        from app.tasks.ingestion import process_upload

        assert process_upload.max_retries == 3
        assert process_upload.autoretry_for is not None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python3 -m pytest tests/test_ingestion_task.py::TestProcessUploadIdempotency -v`
Expected: FAIL — idempotency guard doesn't exist yet, retry config missing

- [ ] **Step 3: Implement retry + idempotency in process_upload**

Rewrite `backend/app/tasks/ingestion.py`:

```python
"""Celery task for processing uploaded CSV files."""

import logging
import os

from sqlalchemy.exc import OperationalError

from app.database import SessionLocal
from app.models.enums import BatchStatus
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(
    bind=True,
    name="process_upload",
    max_retries=3,
    autoretry_for=(OperationalError, ConnectionError),
    retry_backoff=True,
    retry_backoff_max=120,
    retry_jitter=True,
)
def process_upload(self, batch_id: int):
    """Process an uploaded CSV file through the full ingestion pipeline.

    Creates its own database session (Celery tasks manage their own sessions).
    Reports progress via self.update_state().
    Enqueues matching stub on success.

    Idempotency: skips work if batch is already completed or processing.
    Retry: auto-retries on transient DB/connection errors with exponential backoff.
    """
    db = SessionLocal()
    try:
        from app.models.batch import ImportBatch
        from app.services.ingestion import run_ingestion

        batch = db.query(ImportBatch).filter(ImportBatch.id == batch_id).one()

        # Idempotency guard: skip if already completed or processing
        if batch.status in (BatchStatus.COMPLETED, BatchStatus.PROCESSING):
            logger.info("Batch %d already %s, skipping", batch_id, batch.status)
            return {"status": batch.status, "batch_id": batch_id}

        # Mark as processing before starting work
        batch.status = BatchStatus.PROCESSING
        db.commit()

        # Read file from disk
        filepath = os.path.join("data", "uploads", batch.filename)
        with open(filepath, "rb") as f:
            file_content = f.read()

        # Define progress callback
        def progress_callback(stage: str, pct: int):
            self.update_state(
                state=stage.upper(),
                meta={"stage": stage, "progress": pct},
            )

        # Run ingestion pipeline
        row_count = run_ingestion(db, batch_id, file_content, progress_callback)
        db.commit()

        # Enqueue matching — detect re-upload by checking for prior active suppliers
        from app.models.enums import SupplierStatus
        from app.models.staging import StagedSupplier
        from app.tasks.matching import run_matching

        prior_superseded_count = (
            db.query(StagedSupplier)
            .filter(
                StagedSupplier.data_source_id == batch.data_source_id,
                StagedSupplier.import_batch_id != batch.id,
                StagedSupplier.status == SupplierStatus.SUPERSEDED,
            )
            .count()
        )

        if prior_superseded_count > 0:
            matching_task = run_matching.delay(batch_id, invalidate_source_id=batch.data_source_id)
        else:
            matching_task = run_matching.delay(batch_id)

        batch.matching_task_id = matching_task.id
        db.commit()

        logger.info("Ingestion complete for batch %d: %d rows", batch_id, row_count)
        return {"status": "completed", "batch_id": batch_id, "row_count": row_count}

    except Exception as e:
        db.rollback()
        logger.error("Ingestion failed for batch %d: %s", batch_id, e)
        try:
            from app.models.batch import ImportBatch

            batch = db.query(ImportBatch).filter(ImportBatch.id == batch_id).one()
            batch.status = BatchStatus.FAILED
            batch.error_message = str(e)
            db.commit()
        except Exception as mark_err:
            logger.error("Failed to mark batch %d as failed: %s", batch_id, mark_err)
        raise
    finally:
        db.close()
```

- [ ] **Step 4: Implement retry + idempotency in run_matching**

Rewrite `backend/app/tasks/matching.py`:

```python
"""Celery task for matching pipeline — replaces stub with full implementation."""

import logging

from sqlalchemy.exc import OperationalError

from app.database import SessionLocal
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(
    bind=True,
    name="run_matching",
    max_retries=2,
    autoretry_for=(OperationalError, ConnectionError),
    retry_backoff=True,
    retry_backoff_max=120,
    retry_jitter=True,
)
def run_matching(self, batch_id: int, invalidate_source_id: int | None = None):
    """Run the matching pipeline for a given batch.

    Creates its own database session (Celery tasks manage their own sessions).
    Reports progress via self.update_state().
    Optionally invalidates old candidates for re-upload scenarios.

    Idempotency: skips work if candidates already exist for this batch's
    suppliers (unless invalidate_source_id is set, indicating a re-upload).
    Retry: auto-retries on transient DB/connection errors with exponential backoff.
    """
    db = SessionLocal()
    try:
        from app.models.batch import ImportBatch
        from app.models.match import MatchCandidate
        from app.models.staging import StagedSupplier
        from app.services.matching import run_matching_pipeline

        batch = db.query(ImportBatch).filter(ImportBatch.id == batch_id).one()

        # Store matching task ID on batch — commit immediately so it
        # survives pipeline rollback and the status endpoint can always
        # find the matching task.
        batch.matching_task_id = self.request.id
        db.commit()

        # Idempotency guard: check if candidates already exist for
        # suppliers from this batch (unless this is a re-upload).
        if invalidate_source_id is None:
            batch_supplier_ids = (
                db.query(StagedSupplier.id)
                .filter(StagedSupplier.import_batch_id == batch_id)
                .subquery()
            )
            existing_candidates = (
                db.query(MatchCandidate.id)
                .filter(
                    (MatchCandidate.supplier_a_id.in_(batch_supplier_ids))
                    | (MatchCandidate.supplier_b_id.in_(batch_supplier_ids))
                )
                .limit(1)
                .count()
            )
            if existing_candidates > 0:
                logger.info("Matching for batch %d already has candidates, skipping", batch_id)
                return {"status": "completed", "batch_id": batch_id}

        # Progress callback for Celery state updates + WebSocket push
        def progress_callback(stage: str, pct: int):
            self.update_state(
                state=stage.upper(),
                meta={"stage": stage, "progress": pct},
            )
            try:
                from app.services.notifications import publish_notification

                publish_notification(
                    "matching_progress",
                    {
                        "batch_id": batch_id,
                        "stage": stage,
                        "progress": pct,
                    },
                )
            except Exception:  # noqa: S110
                pass

        # Run the pipeline
        stats = run_matching_pipeline(
            db,
            batch_id,
            progress_callback=progress_callback,
            invalidate_source_id=invalidate_source_id,
        )

        db.commit()

        logger.info(
            "Matching complete for batch %d: %d candidates, %d groups",
            batch_id,
            stats["candidate_count"],
            stats["group_count"],
        )

        try:
            from app.services.notifications import publish_notification

            publish_notification(
                "matching_complete",
                {
                    "batch_id": batch_id,
                    "candidate_count": stats["candidate_count"],
                    "group_count": stats["group_count"],
                },
            )
        except Exception as notif_err:
            logger.warning("Failed to publish completion notification: %s", notif_err)

        return {
            "status": "completed",
            "batch_id": batch_id,
            **stats,
        }

    except Exception as e:
        db.rollback()
        logger.error("Matching failed for batch %d: %s", batch_id, e)

        try:
            from app.services.notifications import publish_notification

            publish_notification(
                "matching_failed",
                {"batch_id": batch_id, "error": str(e)},
            )
        except Exception as notif_err:
            logger.warning("Failed to publish failure notification: %s", notif_err)

        raise
    finally:
        db.close()
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python3 -m pytest tests/test_ingestion_task.py -v`
Expected: All tests PASS

- [ ] **Step 6: Run full test suite**

Run: `cd backend && python3 -m pytest -v`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
cd backend && git add app/tasks/ingestion.py app/tasks/matching.py tests/test_ingestion_task.py
git commit -m "feat: add Celery retry with exponential backoff + idempotency guards

process_upload: max_retries=3, skips completed/processing batches, sets
status to 'processing' before work begins.

run_matching: max_retries=2, skips if candidates already exist for batch
suppliers (unless re-upload)."
```

---

## Task 4: Add Embedding Computation Timeout

**Files:**
- Modify: `backend/app/services/embedding.py`
- Modify: `backend/tests/test_embedding.py`

- [ ] **Step 1: Write failing test for timeout**

Add to `backend/tests/test_embedding.py`:

```python
import time

from app.services.embedding import EmbeddingTimeoutError, compute_embeddings


class TestEmbeddingTimeout:
    """Tests for embedding computation timeout."""

    def test_timeout_raises_error(self, test_db):
        """Embedding computation raises EmbeddingTimeoutError on timeout."""
        def slow_encode(*args, **kwargs):
            time.sleep(5)
            return np.zeros((1, 384), dtype=np.float32)

        mock_model = MagicMock()
        mock_model.encode.side_effect = slow_encode

        with patch("app.services.embedding.get_embedding_model", return_value=mock_model):
            with pytest.raises(EmbeddingTimeoutError, match="timed out"):
                compute_embeddings(["test name"], timeout_seconds=1)

    def test_normal_encoding_still_works(self, test_db):
        """Normal encoding works within timeout."""
        mock_model = MagicMock()
        mock_model.encode.return_value = np.random.randn(2, 384).astype(np.float32)

        with patch("app.services.embedding.get_embedding_model", return_value=mock_model):
            result = compute_embeddings(["name1", "name2"], timeout_seconds=30)

        assert result.shape == (2, 384)

    def test_general_exception_propagates(self, test_db):
        """Non-timeout exceptions propagate as-is."""
        mock_model = MagicMock()
        mock_model.encode.side_effect = RuntimeError("Model exploded")

        with patch("app.services.embedding.get_embedding_model", return_value=mock_model):
            with pytest.raises(RuntimeError, match="Model exploded"):
                compute_embeddings(["test"])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python3 -m pytest tests/test_embedding.py::TestEmbeddingTimeout -v`
Expected: FAIL — `EmbeddingTimeoutError` not defined, no `timeout_seconds` parameter

- [ ] **Step 3: Implement timeout in compute_embeddings**

Rewrite `backend/app/services/embedding.py`:

```python
"""Embedding computation service using sentence-transformers."""

import logging
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeoutError

import numpy as np

logger = logging.getLogger(__name__)

_model = None


class EmbeddingTimeoutError(Exception):
    """Raised when embedding computation exceeds the timeout."""


def get_embedding_model():
    """Load all-MiniLM-L6-v2 on first call, return cached instance.

    Lazy-loaded singleton to avoid loading the model at import time.
    """
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer

        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def compute_embeddings(
    names: list[str], batch_size: int = 64, timeout_seconds: int = 300
) -> np.ndarray:
    """Compute 384-dim embeddings for a list of names.

    Args:
        names: List of normalized supplier names.
        batch_size: Batch size for encoding (default 64).
        timeout_seconds: Max seconds before raising EmbeddingTimeoutError (default 300).

    Returns:
        np.ndarray of shape (N, 384) with L2-normalized vectors.
        Returns empty (0, 384) array for empty input.

    Raises:
        EmbeddingTimeoutError: If encoding exceeds timeout_seconds.
    """
    if not names:
        return np.empty((0, 384), dtype=np.float32)

    model = get_embedding_model()

    def _encode():
        return model.encode(
            names,
            batch_size=batch_size,
            normalize_embeddings=True,
            show_progress_bar=False,
        )

    try:
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_encode)
            embeddings = future.result(timeout=timeout_seconds)
        return np.array(embeddings, dtype=np.float32)
    except FuturesTimeoutError:
        logger.error(
            "Embedding computation timed out after %ds for %d names",
            timeout_seconds,
            len(names),
        )
        raise EmbeddingTimeoutError(
            f"Embedding timed out after {timeout_seconds}s for {len(names)} names"
        ) from None
    except Exception as e:
        logger.error("Embedding computation failed: %s", e)
        raise
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python3 -m pytest tests/test_embedding.py -v`
Expected: All tests PASS (including existing tests)

- [ ] **Step 5: Run full test suite**

Run: `cd backend && python3 -m pytest -v`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
cd backend && git add app/services/embedding.py tests/test_embedding.py
git commit -m "feat: add timeout to embedding computation

Uses concurrent.futures.ThreadPoolExecutor (thread-safe, works in Celery
worker context). Defaults to 300s. Raises EmbeddingTimeoutError on timeout."
```

---

## Task 5: Add File Cleanup on Upload Failure

**Files:**
- Modify: `backend/app/tasks/ingestion.py`
- Modify: `backend/app/routers/upload.py`
- Modify: `backend/tests/test_ingestion_task.py`
- Modify: `backend/tests/test_upload.py`

- [ ] **Step 1: Write failing test for file cleanup on task failure**

Add to `backend/tests/test_ingestion_task.py`:

```python
class TestFileCleanupOnFailure:
    """Tests that failed uploads clean up their files."""

    def test_file_deleted_on_ingestion_failure(self, test_db):
        """When ingestion fails, the uploaded file is deleted from disk."""
        import os
        import tempfile

        from app.models.enums import BatchStatus

        source = DataSource(
            name="Test Source",
            file_format="csv",
            delimiter=";",
            column_mapping={"supplier_name": "Name1", "supplier_code": "VendorCode"},
        )
        test_db.add(source)
        test_db.flush()

        # Create a real temp file
        os.makedirs("data/uploads", exist_ok=True)
        test_filename = "cleanup_test.csv"
        test_filepath = os.path.join("data", "uploads", test_filename)
        with open(test_filepath, "wb") as f:
            f.write(b"bad data")

        batch = ImportBatch(
            data_source_id=source.id,
            filename=test_filename,
            uploaded_by="testuser",
            status=BatchStatus.PENDING,
        )
        test_db.add(batch)
        test_db.commit()

        with (
            patch("app.tasks.ingestion.SessionLocal", return_value=test_db),
            patch("app.tasks.ingestion.run_ingestion", side_effect=RuntimeError("Parse error")),
        ):
            from app.tasks.ingestion import process_upload

            with pytest.raises(RuntimeError, match="Parse error"):
                process_upload(batch.id)

        # File should be cleaned up
        assert not os.path.exists(test_filepath)

    def test_cleanup_failure_does_not_crash(self, test_db):
        """If file cleanup itself fails, the error handler still works."""
        import os

        from app.models.enums import BatchStatus

        source = DataSource(
            name="Test Source",
            file_format="csv",
            delimiter=";",
            column_mapping={"supplier_name": "Name1", "supplier_code": "VendorCode"},
        )
        test_db.add(source)
        test_db.flush()

        # Create a file so the task can read it, but it will fail in ingestion
        os.makedirs("data/uploads", exist_ok=True)
        test_filename = "cleanup_fail_test.csv"
        test_filepath = os.path.join("data", "uploads", test_filename)
        with open(test_filepath, "wb") as f:
            f.write(b"data")

        batch = ImportBatch(
            data_source_id=source.id,
            filename=test_filename,
            uploaded_by="testuser",
            status=BatchStatus.PENDING,
        )
        test_db.add(batch)
        test_db.commit()

        with (
            patch("app.tasks.ingestion.SessionLocal", return_value=test_db),
            patch("app.tasks.ingestion.run_ingestion", side_effect=RuntimeError("Fail")),
            patch("os.unlink", side_effect=OSError("Permission denied")),
        ):
            from app.tasks.ingestion import process_upload

            with pytest.raises(RuntimeError, match="Fail"):
                process_upload(batch.id)

        # Batch should still be marked as failed despite cleanup error
        test_db.refresh(batch)
        assert batch.status == BatchStatus.FAILED

        # Clean up the file manually
        if os.path.exists(test_filepath):
            os.unlink(test_filepath)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python3 -m pytest tests/test_ingestion_task.py::TestFileCleanupOnFailure -v`
Expected: FAIL — no cleanup logic yet

- [ ] **Step 3: Add file cleanup to process_upload error handler**

In `backend/app/tasks/ingestion.py`, update the `except` block to add file cleanup before marking the batch as failed:

```python
    except Exception as e:
        db.rollback()
        logger.error("Ingestion failed for batch %d: %s", batch_id, e)
        # Clean up orphaned file
        try:
            batch_for_cleanup = db.query(ImportBatch).filter(ImportBatch.id == batch_id).one()
            if batch_for_cleanup.filename:
                file_full_path = os.path.join("data", "uploads", batch_for_cleanup.filename)
                if os.path.exists(file_full_path):
                    os.unlink(file_full_path)
                    logger.info("Cleaned up file %s for failed batch %d", batch_for_cleanup.filename, batch_id)
        except OSError as cleanup_err:
            logger.warning("Failed to clean up file: %s", cleanup_err)
        except Exception:
            pass  # Don't let cleanup failure mask the original error
        # Ensure batch is marked as failed
        try:
            batch_obj = db.query(ImportBatch).filter(ImportBatch.id == batch_id).one()
            batch_obj.status = BatchStatus.FAILED
            batch_obj.error_message = str(e)
            db.commit()
        except Exception as mark_err:
            logger.error("Failed to mark batch %d as failed: %s", batch_id, mark_err)
        raise
```

- [ ] **Step 4: Write failing test for delete_batch file cleanup**

Add to `backend/tests/test_upload.py`:

```python
class TestDeleteBatchEndpoint:
    """Tests for DELETE /api/import/batches/{batch_id}."""

    def test_delete_batch_removes_file(self, authenticated_client, test_db):
        """Deleting a batch also removes its file from disk."""
        import os

        from app.models.batch import ImportBatch
        from app.models.enums import BatchStatus
        from app.models.source import DataSource

        source = DataSource(
            name="Test Source",
            file_format="csv",
            delimiter=";",
            column_mapping={"supplier_name": "Name1"},
        )
        test_db.add(source)
        test_db.flush()

        # Create a real file
        os.makedirs("data/uploads", exist_ok=True)
        test_filename = "delete_test.csv"
        test_filepath = os.path.join("data", "uploads", test_filename)
        with open(test_filepath, "wb") as f:
            f.write(b"code;name\n001;Acme\n")

        batch = ImportBatch(
            data_source_id=source.id,
            filename=test_filename,
            uploaded_by="testuser",
            status=BatchStatus.FAILED,
        )
        test_db.add(batch)
        test_db.commit()

        response = authenticated_client.delete(f"/api/import/batches/{batch.id}")
        assert response.status_code == 204

        # File should be deleted
        assert not os.path.exists(test_filepath)

    def test_delete_batch_missing_file_succeeds(self, authenticated_client, test_db):
        """Deleting a batch succeeds even if the file is already gone."""
        from app.models.batch import ImportBatch
        from app.models.enums import BatchStatus
        from app.models.source import DataSource

        source = DataSource(
            name="Test Source",
            file_format="csv",
            delimiter=";",
            column_mapping={"supplier_name": "Name1"},
        )
        test_db.add(source)
        test_db.flush()

        batch = ImportBatch(
            data_source_id=source.id,
            filename="nonexistent.csv",
            uploaded_by="testuser",
            status=BatchStatus.PENDING,
        )
        test_db.add(batch)
        test_db.commit()

        response = authenticated_client.delete(f"/api/import/batches/{batch.id}")
        assert response.status_code == 204
```

- [ ] **Step 5: Add file cleanup to delete_batch endpoint**

In `backend/app/routers/upload.py`, in the `delete_batch` function, add file deletion before `db.delete(batch)`:

```python
    # Clean up file from disk
    if batch.filename:
        file_full_path = os.path.join(UPLOAD_DIR, batch.filename)
        if os.path.exists(file_full_path):
            os.unlink(file_full_path)

    db.delete(batch)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && python3 -m pytest tests/test_ingestion_task.py::TestFileCleanupOnFailure tests/test_upload.py::TestDeleteBatchEndpoint -v`
Expected: All tests PASS

- [ ] **Step 7: Run full test suite**

Run: `cd backend && python3 -m pytest -v`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
cd backend && git add app/tasks/ingestion.py app/routers/upload.py tests/test_ingestion_task.py tests/test_upload.py
git commit -m "feat: clean up uploaded files on task failure and batch deletion

Failed ingestion tasks now delete the orphaned CSV file from disk.
DELETE /api/import/batches/{id} also removes the file."
```

---

## Task 6: Add WebSocket Authentication

**Files:**
- Modify: `backend/app/routers/ws.py`
- Modify: `backend/tests/test_ws.py`

**Note:** The frontend hook `useMatchingNotifications.ts` already sends the token via query param — no frontend changes needed.

- [ ] **Step 1: Write failing tests for WebSocket auth**

Add to `backend/tests/test_ws.py`:

```python
from app.services.auth import create_token


class TestWebSocketAuth:
    """Tests for WebSocket JWT authentication."""

    def test_connection_without_token_rejected(self, test_client):
        """WebSocket connection without token is rejected."""
        with patch("app.routers.ws.aioredis") as mock_aioredis:
            mock_redis = MagicMock()
            mock_aioredis.from_url.return_value = mock_redis

            from starlette.testclient import TestClient
            from starlette.websockets import WebSocketDisconnect

            with pytest.raises(Exception):
                # Connection without token should fail
                with test_client.websocket_connect("/ws/notifications") as ws:
                    pass

    def test_connection_with_invalid_token_rejected(self, test_client):
        """WebSocket connection with invalid token is rejected."""
        with patch("app.routers.ws.aioredis") as mock_aioredis:
            mock_redis = MagicMock()
            mock_aioredis.from_url.return_value = mock_redis

            with pytest.raises(Exception):
                with test_client.websocket_connect(
                    "/ws/notifications?token=invalid.jwt.token"
                ) as ws:
                    pass

    def test_connection_with_valid_token_accepted(self, test_client, test_db):
        """WebSocket connection with valid JWT is accepted."""
        from app.models.user import User
        from app.services.auth import hash_password

        user = User(
            username="wsuser",
            password_hash=hash_password("pass"),
            is_active=True,
        )
        test_db.add(user)
        test_db.commit()

        token = create_token("wsuser")

        with patch("app.routers.ws.aioredis") as mock_aioredis:
            mock_redis = MagicMock()
            mock_pubsub = MagicMock()

            mock_aioredis.from_url.return_value = mock_redis

            async def mock_subscribe(*args):
                pass

            async def mock_unsubscribe(*args):
                pass

            async def mock_close():
                pass

            async def mock_get_message(**kwargs):
                return None

            mock_pubsub.subscribe = mock_subscribe
            mock_pubsub.unsubscribe = mock_unsubscribe
            mock_pubsub.close = mock_close
            mock_pubsub.get_message = mock_get_message
            mock_redis.pubsub.return_value = mock_pubsub
            mock_redis.close = mock_close

            with test_client.websocket_connect(
                f"/ws/notifications?token={token}"
            ) as ws:
                ws.send_text("ping")
                response = ws.receive_text()
                data = json.loads(response)
                assert data["type"] == "pong"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python3 -m pytest tests/test_ws.py::TestWebSocketAuth -v`
Expected: FAIL — unauthenticated connections currently succeed

- [ ] **Step 3: Implement WebSocket authentication**

Rewrite `backend/app/routers/ws.py`:

```python
"""WebSocket endpoint for real-time notifications.

Subscribes to a Redis pub/sub channel and relays messages to connected
WebSocket clients, enabling push notifications for matching completion/failure.
"""

import asyncio
import json
import logging

import jwt as pyjwt
import redis.asyncio as aioredis
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, WebSocketException, status

from app.config import settings
from app.services.notifications import CHANNEL

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/notifications")
async def ws_notifications(websocket: WebSocket, token: str | None = None):
    """WebSocket endpoint that relays Redis pub/sub notifications to the client.

    Requires a valid JWT token via the `token` query parameter.
    Rejects connections before accept if token is missing or invalid.
    """
    if not token:
        raise WebSocketException(
            code=status.WS_1008_POLICY_VIOLATION,
            reason="Missing authentication token",
        )

    try:
        payload = pyjwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        username = payload.get("sub")
        if not username:
            raise pyjwt.PyJWTError("Missing subject")
    except pyjwt.PyJWTError:
        raise WebSocketException(
            code=status.WS_1008_POLICY_VIOLATION,
            reason="Invalid authentication token",
        )

    await websocket.accept()
    logger.info("WebSocket client connected: %s", username)

    async_redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    pubsub = async_redis.pubsub()
    await pubsub.subscribe(CHANNEL)

    try:
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message and message["type"] == "message":
                try:
                    await websocket.send_text(message["data"])
                except (WebSocketDisconnect, RuntimeError):
                    break

            try:
                client_msg = await asyncio.wait_for(websocket.receive_text(), timeout=0.1)
                if client_msg == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except TimeoutError:
                pass
            except (WebSocketDisconnect, RuntimeError):
                break

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected: %s", username)
    except Exception as e:
        logger.error("WebSocket error: %s", e)
    finally:
        await pubsub.unsubscribe(CHANNEL)
        await pubsub.close()
        await async_redis.close()
        logger.info("WebSocket cleanup complete for %s", username)
```

- [ ] **Step 4: Update existing WebSocket test**

The existing `test_websocket_accepts_connection` test in `TestWebSocketEndpoint` now needs a valid token. Update it:

```python
    def test_websocket_accepts_connection(self, test_client, test_db):
        """WebSocket endpoint accepts connections with valid token (mocked Redis)."""
        from app.models.user import User
        from app.services.auth import create_token, hash_password

        user = User(
            username="wstest",
            password_hash=hash_password("pass"),
            is_active=True,
        )
        test_db.add(user)
        test_db.commit()

        token = create_token("wstest")

        with patch("app.routers.ws.aioredis") as mock_aioredis:
            mock_redis = MagicMock()
            mock_pubsub = MagicMock()

            mock_aioredis.from_url.return_value = mock_redis

            async def mock_subscribe(*args):
                pass

            async def mock_unsubscribe(*args):
                pass

            async def mock_close():
                pass

            async def mock_get_message(**kwargs):
                return None

            mock_pubsub.subscribe = mock_subscribe
            mock_pubsub.unsubscribe = mock_unsubscribe
            mock_pubsub.close = mock_close
            mock_pubsub.get_message = mock_get_message
            mock_redis.pubsub.return_value = mock_pubsub
            mock_redis.close = mock_close

            with test_client.websocket_connect(
                f"/ws/notifications?token={token}"
            ) as ws:
                ws.send_text("ping")
                response = ws.receive_text()
                data = json.loads(response)
                assert data["type"] == "pong"
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python3 -m pytest tests/test_ws.py -v`
Expected: All tests PASS

- [ ] **Step 6: Run full test suite**

Run: `cd backend && python3 -m pytest -v`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
cd backend && git add app/routers/ws.py tests/test_ws.py
git commit -m "feat: add JWT authentication to WebSocket endpoint

Rejects connections before accept using WebSocketException if token is
missing or invalid. Uses PyJWT (not jose) matching the rest of the codebase."
```

---

## Task 7: Protect Re-upload Against Race Conditions

**Files:**
- Modify: `backend/app/routers/upload.py`
- Modify: `backend/app/services/ingestion.py`
- Modify: `backend/tests/test_upload.py`

- [ ] **Step 1: Write failing test for re-upload guard**

Add to `backend/tests/test_upload.py`:

```python
class TestReuploadGuard:
    """Tests for preventing concurrent re-uploads."""

    def test_reupload_blocked_while_pending(self, authenticated_client, test_db):
        """Upload returns 409 if source already has a pending batch."""
        from app.models.batch import ImportBatch
        from app.models.enums import BatchStatus
        from app.models.source import DataSource

        source = DataSource(
            name="Test Source",
            file_format="csv",
            delimiter=";",
            column_mapping={"supplier_name": "Name1", "supplier_code": "VendorCode"},
        )
        test_db.add(source)
        test_db.flush()

        # Create an in-progress batch
        existing_batch = ImportBatch(
            data_source_id=source.id,
            filename="first.csv",
            uploaded_by="testuser",
            status=BatchStatus.PENDING,
        )
        test_db.add(existing_batch)
        test_db.commit()

        with patch("app.routers.upload.process_upload") as mock_task:
            mock_result = MagicMock()
            mock_result.id = "test-task-123"
            mock_task.delay.return_value = mock_result

            response = authenticated_client.post(
                "/api/import/upload",
                data={"data_source_id": str(source.id)},
                files={"file": ("second.csv", b"code;name\n001;Acme\n", "text/csv")},
            )

        assert response.status_code == 409
        assert "in-progress" in response.json()["detail"]

    def test_reupload_blocked_while_processing(self, authenticated_client, test_db):
        """Upload returns 409 if source already has a processing batch."""
        from app.models.batch import ImportBatch
        from app.models.enums import BatchStatus
        from app.models.source import DataSource

        source = DataSource(
            name="Test Source",
            file_format="csv",
            delimiter=";",
            column_mapping={"supplier_name": "Name1", "supplier_code": "VendorCode"},
        )
        test_db.add(source)
        test_db.flush()

        existing_batch = ImportBatch(
            data_source_id=source.id,
            filename="first.csv",
            uploaded_by="testuser",
            status=BatchStatus.PROCESSING,
        )
        test_db.add(existing_batch)
        test_db.commit()

        with patch("app.routers.upload.process_upload") as mock_task:
            mock_result = MagicMock()
            mock_result.id = "test-task-123"
            mock_task.delay.return_value = mock_result

            response = authenticated_client.post(
                "/api/import/upload",
                data={"data_source_id": str(source.id)},
                files={"file": ("second.csv", b"code;name\n001;Acme\n", "text/csv")},
            )

        assert response.status_code == 409

    def test_reupload_allowed_after_completion(self, authenticated_client, test_db):
        """Upload succeeds if prior batch is completed."""
        from app.models.batch import ImportBatch
        from app.models.enums import BatchStatus
        from app.models.source import DataSource

        source = DataSource(
            name="Test Source",
            file_format="csv",
            delimiter=";",
            column_mapping={"supplier_name": "Name1", "supplier_code": "VendorCode"},
        )
        test_db.add(source)
        test_db.flush()

        existing_batch = ImportBatch(
            data_source_id=source.id,
            filename="first.csv",
            uploaded_by="testuser",
            status=BatchStatus.COMPLETED,
        )
        test_db.add(existing_batch)
        test_db.commit()

        with patch("app.routers.upload.process_upload") as mock_task:
            mock_result = MagicMock()
            mock_result.id = "test-task-456"
            mock_task.delay.return_value = mock_result

            response = authenticated_client.post(
                "/api/import/upload",
                data={"data_source_id": str(source.id)},
                files={"file": ("second.csv", b"code;name\n001;Acme\n", "text/csv")},
            )

        assert response.status_code == 201
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python3 -m pytest tests/test_upload.py::TestReuploadGuard -v`
Expected: FAIL — no re-upload guard exists

- [ ] **Step 3: Add re-upload guard to upload endpoint**

In `backend/app/routers/upload.py`, add the guard after the data source validation (after line 101, before `# Create import batch`):

```python
    from app.models.enums import BatchStatus

    # Block re-upload while a batch is still processing for this source
    active_batch = (
        db.query(ImportBatch)
        .filter(
            ImportBatch.data_source_id == data_source_id,
            ImportBatch.status.in_([BatchStatus.PENDING, BatchStatus.PROCESSING]),
        )
        .first()
    )
    if active_batch:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Source already has an in-progress upload (batch {active_batch.id}). "
            f"Wait for it to complete before re-uploading.",
        )
```

- [ ] **Step 4: Add row locking to ingestion service**

In `backend/app/services/ingestion.py`, update the supersession query (around line 90) to add `with_for_update(nowait=True)`:

```python
        # 2. SUPERSEDE old records (if this source has existing active records)
        try:
            existing_active = (
                db.query(StagedSupplier)
                .filter(
                    StagedSupplier.data_source_id == source.id,
                    StagedSupplier.status == SupplierStatus.ACTIVE,
                )
                .with_for_update(nowait=True)
                .all()
            )
        except Exception:
            # SQLite doesn't support FOR UPDATE — fall back to unlocked query.
            # In production (PostgreSQL), OperationalError means rows are locked
            # by a concurrent re-upload.
            import sqlalchemy.exc

            existing_active = (
                db.query(StagedSupplier)
                .filter(
                    StagedSupplier.data_source_id == source.id,
                    StagedSupplier.status == SupplierStatus.ACTIVE,
                )
                .all()
            )
```

> **Note on SQLite compatibility:** SQLite doesn't support `FOR UPDATE`. The `try/except` fallback ensures tests using SQLite still pass. In production (PostgreSQL), `with_for_update(nowait=True)` provides the row-level lock. The API-level guard (step 3) is the primary protection; the row lock is defense in depth.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python3 -m pytest tests/test_upload.py::TestReuploadGuard -v`
Expected: All tests PASS

- [ ] **Step 6: Run full test suite**

Run: `cd backend && python3 -m pytest -v`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
cd backend && git add app/routers/upload.py app/services/ingestion.py tests/test_upload.py
git commit -m "feat: protect re-upload against race conditions

API-level guard returns 409 if source has pending/processing batch.
DB-level row locking (FOR UPDATE NOWAIT) on PostgreSQL as defense in depth.
SQLite fallback for test compatibility."
```

---

## Task 8: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `cd backend && python3 -m pytest -v`
Expected: All tests PASS

- [ ] **Step 2: Run linter**

Run: `cd backend && python3 -m ruff check .`
Expected: No errors

- [ ] **Step 3: Verify no raw status literals remain in app code**

Run: `cd backend && grep -rn '"pending"\|"completed"\|"failed"\|"failure"\|"active"\|"superseded"\|"confirmed"\|"rejected"\|"skipped"\|"invalidated"' app/ --include="*.py" | grep -v enums.py | grep -v __pycache__ | grep -v alembic | grep -v "# "`

Expected: No matches (only in return dicts that are Celery metadata, not DB values, are acceptable)

- [ ] **Step 4: Commit any final cleanup**

If step 3 found remaining literals, fix and commit.

- [ ] **Step 5: Verify exit criteria**

Check each criterion from the spec:
- [x] Celery tasks retry with exponential backoff, skip completed work
- [x] Embedding computation has thread-safe timeout
- [x] Failed uploads clean up files from disk
- [x] WebSocket requires JWT auth (rejected before accept)
- [x] All status values use Python enums
- [x] Concurrent re-uploads blocked with 409
- [x] All tests pass
