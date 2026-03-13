---
phase: 01-foundation-ingestion-pipeline
plan: 04
subsystem: ui
tags: [react, tailwind, drag-drop, file-upload, tanstack-query, column-mapping, progress-tracker]

# Dependency graph
requires:
  - phase: 01-foundation-ingestion-pipeline (plan 02)
    provides: Backend upload/import/sources API endpoints, Celery task states
  - phase: 01-foundation-ingestion-pipeline (plan 03)
    provides: React scaffold, API client, auth hooks, app shell, types
provides:
  - Drag-and-drop CSV file upload component
  - Visual column mapper with CSV header dropdowns for new data sources
  - Real-time pipeline progress tracker (parsing → normalizing → embedding → match enqueued)
  - Re-upload confirmation dialog with impact awareness
  - Batch history table with status color coding
  - Complete Upload page orchestrator with 4-state machine
  - useTaskStatus polling hook for Celery task progress
affects: [02-matching-engine, 03-review-merge]

# Tech tracking
tech-stack:
  added: []
  patterns: [state-machine-page-orchestrator, polling-hook-with-tanstack-query, drag-and-drop-file-input, step-wizard-column-mapping]

key-files:
  created:
    - frontend/src/components/DropZone.tsx
    - frontend/src/components/ColumnMapper.tsx
    - frontend/src/components/ProgressTracker.tsx
    - frontend/src/components/ReUploadDialog.tsx
    - frontend/src/components/BatchHistory.tsx
    - frontend/src/hooks/useTaskStatus.ts
  modified:
    - frontend/src/api/types.ts
    - frontend/src/pages/Upload.tsx
    - frontend/src/app.css

key-decisions:
  - "4-state machine for Upload page: SELECT_SOURCE → UPLOAD_FILE → MAP_COLUMNS → PROCESSING"
  - "useTaskStatus polling at 1s interval, auto-stops on COMPLETE/FAILURE"
  - "Re-upload dialog uses batch count check (no dedicated reupload-info endpoint needed)"
  - "Column mapper uses 2-step wizard flow: name source → map canonical fields"

patterns-established:
  - "State machine page orchestrator: complex pages use explicit state enum with switch rendering"
  - "Polling hook pattern: TanStack Query with refetchInterval for real-time updates"
  - "Component composition: page-level orchestrator delegates to focused single-responsibility components"

requirements-completed: [INGS-03, OPS-06]

# Metrics
duration: 5min
completed: 2026-03-13
---

# Phase 1 Plan 4: Frontend Upload Experience Summary

**Complete upload experience with drag-and-drop file upload, 2-step column mapper for new sources, real-time 4-stage pipeline progress tracker, re-upload confirmation dialog, and batch history table — all production-grade dark theme**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-13T19:46:19Z
- **Completed:** 2026-03-13T19:51:20Z
- **Tasks:** 2 (1 auto + 1 soft checkpoint)
- **Files modified:** 9

## Accomplishments
- Drag-and-drop upload zone with CSV-only filtering, visual drag-over feedback, and Browse button
- Column mapper with 2-step wizard: name/describe source → map canonical fields (supplier_name, supplier_code, etc.) to detected CSV headers via dropdowns
- Real-time progress tracker showing 4 pipeline stages (Parsing → Normalizing → Embedding → Match Enqueued) with animated spinner on active stage
- Re-upload confirmation dialog with source name and supersession warning
- Batch history table with status color coding (completed/failed/processing/superseded)
- Upload page orchestrator with 4-state machine (SELECT_SOURCE → UPLOAD_FILE → MAP_COLUMNS → PROCESSING)
- useTaskStatus polling hook with TanStack Query (1s interval, auto-stop on terminal states)

## Task Commits

Each task was committed atomically:

1. **Task 1: Upload page with drag-drop, column mapper, progress tracker, re-upload dialog, batch history** - `8616137` (feat)
2. **Task 2: Visual + functional verification** - soft checkpoint (no commit needed)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified
- `frontend/src/components/DropZone.tsx` - Drag-and-drop file upload zone with CSV filtering and visual feedback
- `frontend/src/components/ColumnMapper.tsx` - 2-step column mapper: name source → map canonical fields to CSV headers
- `frontend/src/components/ProgressTracker.tsx` - Real-time 4-stage pipeline progress with animated stages
- `frontend/src/components/ReUploadDialog.tsx` - Modal confirmation dialog for re-upload with impact warning
- `frontend/src/components/BatchHistory.tsx` - Batch history table with status color coding and TanStack Query
- `frontend/src/hooks/useTaskStatus.ts` - Polling hook for Celery task status (1s interval)
- `frontend/src/api/types.ts` - Added UploadResponse, BatchResponse, TaskStatus, ColumnDetectResponse types
- `frontend/src/pages/Upload.tsx` - Upload page orchestrator with 4-state machine
- `frontend/src/app.css` - Added fadeIn and slideUp keyframe animations

## Decisions Made
- **4-state machine orchestrator**: Upload page uses explicit state enum (SELECT_SOURCE, UPLOAD_FILE, MAP_COLUMNS, PROCESSING) with switch rendering — cleanest way to manage the complex multi-step flow
- **1-second polling interval**: useTaskStatus polls every 1s for responsive feel during typically short (5-30s) pipeline runs, auto-stops on COMPLETE/FAILURE
- **No dedicated reupload-info endpoint**: Re-upload dialog checks existing batches via GET /api/import/batches — avoids backend changes, counts can be enhanced when Phase 2 adds match candidates
- **2-step column mapper wizard**: "Step 1: Name your source" → "Step 2: Map columns" provides clear visual hierarchy per CONTEXT.md locked decision

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- **Phase 1 complete**: All 4 plans executed — Docker infrastructure, backend ingestion pipeline, frontend scaffold, and upload experience are all in place
- **Ready for Phase 2**: Matching engine can consume staged suppliers with embeddings; upload pipeline triggers matching task enqueue; UI foundation ready for review queue and match display components
- **Integration point**: Phase 2 will connect to the automatically-enqueued Celery matching task that fires after ingestion completes

## Self-Check: PASSED

All 9 files verified present. Commit `8616137` verified in git log. SUMMARY.md created successfully.

---
*Phase: 01-foundation-ingestion-pipeline*
*Completed: 2026-03-13*
