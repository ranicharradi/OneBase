---
id: S04
parent: M001
milestone: M001
provides:
  - Review queue with filtering and stats
  - Side-by-side match detail with signal breakdowns
  - Field-level merge with conflict resolution
  - Golden record creation with full provenance
requires:
  - slice: S03
    provides: Match candidates, match groups, scoring signals
affects:
  - S05
key_files:
  - backend/app/models/unified.py
  - backend/app/services/merge.py
  - backend/app/routers/review.py
  - backend/app/schemas/review.py
  - backend/alembic/versions/003_unified_suppliers.py
  - frontend/src/pages/ReviewQueue.tsx
  - frontend/src/pages/ReviewDetail.tsx
key_decisions:
  - "Field provenance stored as JSONB on unified_suppliers — one column with per-field object (value, source_entity, source_record_id, auto, chosen_by, chosen_at) rather than separate provenance table"
  - "Canonical fields (7 total) participate in merge comparison — name, source_code, short_name, currency, payment_terms, contact_name, supplier_type"
  - "Three-way field classification: identical (auto-merged), source-only (auto-included with source label), conflict (requires user selection via radio buttons)"
  - "Review actions are merge/reject/skip — skipped candidates can be rejected later, but confirmed/rejected are terminal"
  - "Session.get() instead of Query.get() throughout review router — follows SQLAlchemy 2.0 patterns"
patterns_established:
  - "JSONB provenance pattern for field-level tracking on golden records"
  - "compare_fields() as shared utility between detail endpoint and merge service"
  - "Review queue with source-pair and confidence-range filtering"
  - "Side-by-side radio button merge UI for conflict resolution"
observability_surfaces:
  - "GET /api/review/stats — pending/confirmed/rejected/skipped/unified counts"
  - "Audit trail entries: merge_confirmed, match_rejected, match_skipped"
drill_down_paths:
  - none (single-context-window execution)
duration: ~1 session
verification_result: passed
completed_at: 2026-03-15
---

# S04: Review Merge

**Full review-merge pipeline: queue with filtering, side-by-side comparison with signal breakdowns, field-level conflict resolution via radio buttons, and golden record creation with per-field provenance tracking.**

## What Happened

Built the complete review-merge feature in a single pass across backend and frontend.

**Backend (models + migration):** Created `UnifiedSupplier` model with JSONB `provenance` column storing per-field origin tracking (source entity, source record, who chose, when, auto vs manual). Migration 003 adds the `unified_suppliers` table with indexes on `match_candidate_id` and `created_by`.

**Backend (merge service):** `compare_fields()` classifies each of 7 canonical fields into identical, conflict, source-A-only, or source-B-only. `execute_merge()` auto-includes identical and source-only fields, requires user selections for conflicts, validates completeness, creates the unified record, marks the candidate confirmed, and logs to audit trail. `reject_candidate()` and `skip_candidate()` handle the other two review actions.

**Backend (review router):** Six endpoints — `GET /api/review/queue` (paginated, filterable by status, source pair, confidence range), `GET /api/review/candidates/{id}` (full side-by-side detail with field comparisons and signal breakdowns), `POST .../merge`, `POST .../reject`, `POST .../skip`, and `GET /api/review/stats`. Source-pair filtering joins through staged suppliers to data sources, supporting bidirectional matching (A↔B).

**Frontend (ReviewQueue):** Stats bar showing pending/confirmed/rejected/skipped/unified counts. Filter controls for status, source entity, and confidence range. Data-dense table with supplier names, source labels, confidence badges, and status badges. Click-through to detail view.

**Frontend (ReviewDetail):** Confidence ring with animated SVG arc. Signal breakdown with labeled progress bars. Side-by-side field comparison grid with visual indicators (checkmark for identical, warning triangle for conflict, arrow for source-only). Radio button selectors for conflict resolution. Merge/reject/skip action bar with conflict progress counter and error display. Post-action status banners.

## Verification

- **17 unit + integration tests** covering field comparison logic, merge execution, reject/skip, all 6 API endpoints, edge cases (missing selections, double-action prevention, confidence range filtering)
- **Full test suite: 160 tests pass** (no regressions)
- **TypeScript compilation:** `tsc --noEmit` passes clean
- **Production build:** `vite build` succeeds (381KB JS, 86KB CSS)
- **0 SQLAlchemy deprecation warnings** (migrated to Session.get())

## Requirements Advanced

- REVW-01 — Review queue endpoint with pagination and status filtering
- REVW-02 — Source pair and confidence range filters on queue
- REVW-03 — Side-by-side detail endpoint with signal breakdowns
- REVW-04 — Field comparison with conflict/identical/source-only classification
- REVW-05 — Radio button field selection for conflicts in merge UI
- REVW-06 — Merge, reject, and skip endpoints with state guards
- REVW-07 — Identical fields auto-included in merge with auto:true provenance
- REVW-08 — Source-only fields auto-included with source entity label
- UNIF-01 — Merge creates UnifiedSupplier golden record
- UNIF-02 — Per-field provenance (source_entity, source_record_id, chosen_by, chosen_at, auto flag)

## Requirements Validated

- REVW-01 — 17 passing tests including queue endpoint with filtering
- REVW-02 — Confidence range filter test confirms min/max bounds work
- REVW-03 — Match detail test verifies all 7 field comparisons returned with supplier data
- REVW-04 — 4 field comparison tests verify identical, conflict, source-only detection
- REVW-05 — Merge test confirms user selections applied to golden record
- REVW-06 — Merge/reject/skip tests + cannot-merge-already-rejected guard test
- REVW-07 — Merge test asserts short_name auto-included with auto:true provenance
- REVW-08 — Merge test asserts contact_name (A-only) auto-included with source label
- UNIF-01 — Merge endpoint test verifies UnifiedSupplier created in DB
- UNIF-02 — Merge test verifies provenance JSONB on all fields including auto flag

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

The slice plan was empty (no tasks defined). Executed as a single-pass implementation covering the full review-merge pipeline rather than breaking into separate tasks.

## Known Limitations

- Review queue pagination is offset-based (no cursor pagination) — adequate for ~5K suppliers
- No keyboard shortcuts for merge/reject/skip actions
- Multi-way merges (3+ suppliers in a group) not yet supported — current UI handles pairwise only
- Singleton promotion (UNIF-05) deferred to S05

## Follow-ups

- S05 needs unified supplier browsing with provenance badges
- S05 should add singleton promotion (suppliers with no match candidates → unified directly)
- Multi-way group merge could be added later if needed (current pairwise covers the primary flow)

## Files Created/Modified

- `backend/app/models/unified.py` — UnifiedSupplier model with JSONB provenance
- `backend/app/models/__init__.py` — added UnifiedSupplier export
- `backend/alembic/versions/003_unified_suppliers.py` — migration for unified_suppliers table
- `backend/app/schemas/review.py` — all review/merge Pydantic schemas
- `backend/app/services/merge.py` — compare_fields, execute_merge, reject/skip services
- `backend/app/routers/review.py` — 6 review API endpoints
- `backend/app/main.py` — registered review router
- `backend/tests/test_review_merge.py` — 17 tests (service + API)
- `frontend/src/api/types.ts` — review/merge TypeScript interfaces
- `frontend/src/pages/ReviewQueue.tsx` — review queue page with filters and stats
- `frontend/src/pages/ReviewDetail.tsx` — side-by-side comparison + merge UI
- `frontend/src/App.tsx` — added /review and /review/:id routes
- `frontend/src/components/Layout.tsx` — added Review nav item to sidebar

## Forward Intelligence

### What the next slice should know
- UnifiedSupplier records are created via the merge endpoint — query `unified_suppliers` for golden records
- Provenance JSONB structure: `{ field: { value, source_entity, source_record_id, auto, chosen_by, chosen_at } }`
- `source_supplier_ids` JSON array on unified record links back to staged suppliers for tracing
- Review stats endpoint (`GET /api/review/stats`) already returns unified count — S05 dashboard can use this

### What's fragile
- Source-pair filtering uses subquery joins that could be slow on large datasets — works fine for ~5K suppliers but profile if scaling
- The 7 canonical fields are hardcoded in `CANONICAL_FIELDS` in merge.py — if new fields are added to staging model, this list needs updating

### Authoritative diagnostics
- `GET /api/review/stats` — single source of truth for review pipeline health
- `backend/tests/test_review_merge.py` — comprehensive test coverage for all merge paths
- Audit trail entries (merge_confirmed, match_rejected, match_skipped) — query audit_log for review activity

### What assumptions changed
- Assumed separate task breakdown would be needed — single-pass implementation was sufficient for the scope
- Assumed multi-way group merge would be needed in this slice — pairwise merge covers the primary workflow, deferred group merge to future enhancement
