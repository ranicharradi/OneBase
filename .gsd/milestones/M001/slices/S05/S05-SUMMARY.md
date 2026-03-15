---
id: S05
parent: M001
milestone: M001
provides:
  - Unified supplier browse with search and type filtering
  - Unified supplier detail with per-field provenance badges and audit trail
  - Singleton detection and promotion (single + bulk)
  - CSV export with provenance metadata
  - Dashboard with upload stats, match stats, review progress, unified stats, recent activity
  - Navigation restructure — Dashboard as landing page
requires:
  - slice: S04
    provides: Unified supplier model, merge service, review router, provenance JSONB pattern
affects: []
key_files:
  - backend/app/routers/unified.py
  - backend/app/schemas/unified.py
  - backend/tests/test_unified.py
  - frontend/src/pages/Dashboard.tsx
  - frontend/src/pages/UnifiedSuppliers.tsx
  - frontend/src/pages/UnifiedSupplierDetail.tsx
  - frontend/src/App.tsx
  - frontend/src/components/Layout.tsx
  - frontend/src/api/types.ts
key_decisions:
  - "Singleton = active staged supplier not in any match candidate pair and not already unified — computed dynamically, no status column"
  - "Singleton promotion creates UnifiedSupplier with match_candidate_id=NULL and full single-source provenance (all fields auto:true)"
  - "Bulk promote endpoint for batch singleton promotion — skips invalid/already-unified silently"
  - "CSV export includes 7 provenance source columns alongside data columns — each shows source entity + auto/manual"
  - "Dashboard as default landing page (/ redirects to /dashboard) — replaces /sources as default"
  - "Dashboard auto-refreshes every 30s via React Query refetchInterval"
patterns_established:
  - "Unified router at /api/unified/* — browse, detail, singletons, export, dashboard all under one prefix"
  - "Dynamic singleton detection via set exclusion (matched IDs ∪ already-unified IDs)"
  - "StreamingResponse for CSV export with timestamped filename"
  - "Stat card + progress bar dashboard components with Dark Precision Editorial styling"
observability_surfaces:
  - "GET /api/unified/dashboard — single endpoint for all operational stats"
  - "Audit trail entries: singleton_promoted, unified_exported"
  - "Dashboard auto-refresh at 30s interval for near-real-time stats"
drill_down_paths:
  - none (single-context-window execution)
duration: ~1 session
verification_result: passed
completed_at: 2026-03-15
---

# S05: Unified Browse, Dashboard + Polish

**Complete unified supplier browsing with provenance badges, singleton promotion, CSV export, and operational dashboard — the final MVP surface layer.**

## What Happened

Built the full S05 scope in a single pass across backend and frontend.

**Backend (unified router):** New router at `/api/unified/*` with 7 endpoints:
- `GET /suppliers` — paginated browse with search and type filtering (merged/singleton)
- `GET /suppliers/{id}` — full detail with parsed provenance, source records, and merge history from audit trail
- `GET /singletons` — lists staged suppliers eligible for promotion (active, not in any match pair, not already unified)
- `POST /singletons/{id}/promote` — creates UnifiedSupplier with single-source provenance (all auto:true)
- `POST /singletons/bulk-promote` — batch promotion, skips invalid entries silently
- `GET /export` — CSV export with data + provenance columns via StreamingResponse
- `GET /dashboard` — aggregated stats from all tables (uploads, matching, review, unified) + recent activity

**Frontend (Dashboard):** Stat cards for staged suppliers, match candidates, pending review, and unified records (accent-highlighted). Review progress bars. Upload summary grid. Scrollable recent activity feed with color-coded action labels and relative timestamps. Auto-refreshes every 30s.

**Frontend (UnifiedSuppliers):** Tabbed interface — "Unified Records" browse table with name search and type filter, click-through to detail; "Singletons" tab with checkbox selection, per-row promote buttons, and bulk promote action bar. Export CSV button triggers authenticated download.

**Frontend (UnifiedSupplierDetail):** Three-column layout with fields & provenance (left 2/3) showing per-field provenance badges (manual vs auto, source entity, chosen_by) and source records + audit trail sidebar (right 1/3).

**Navigation restructure:** Dashboard added as first nav item and default landing page (`/ → /dashboard`). Unified added as second item. Review icon changed to match arrows (swap) to differentiate from Unified (checkmark badge).

## Verification

- **16 new backend tests** covering browse (5), detail (2), singleton promotion (5), export (2), dashboard (2)
- **Full test suite: 176 tests pass** (zero regressions from S01-S04)
- **TypeScript compilation:** `tsc --noEmit` passes clean
- **Production build:** `vite build` succeeds (434KB JS, 89KB CSS)

## Requirements Advanced

- UNIF-03 — Browse endpoint + frontend table with search, type filter, provenance badges
- UNIF-04 — Detail endpoint returns merge history from audit trail; frontend shows audit trail sidebar
- UNIF-05 — Singleton detection, single promote, and bulk promote with provenance
- UNIF-06 — CSV export with provenance metadata columns (source entity + auto/manual per field)
- OPS-01 — Dashboard with upload stats, match stats, review progress bars, unified stats, recent activity

## Requirements Validated

- UNIF-03 — 5 browse tests (list, search, singleton/merged filters); frontend renders table with provenance badges
- UNIF-04 — Detail test verifies provenance and source records returned; frontend audit trail rendered
- UNIF-05 — 5 singleton tests (list empty, excludes matched, promote, already-unified guard, bulk promote)
- UNIF-06 — 2 export tests (empty CSV header-only, data CSV with correct row count)
- OPS-01 — 2 dashboard tests (empty state, populated data with correct counts)

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

The slice plan was empty (no tasks defined). Executed as a two-phase pass (backend then frontend) covering the full scope rather than breaking into separate tasks. No deviations from the roadmap-level goal.

## Known Limitations

- Singleton detection uses in-memory set operations — adequate for ~5K suppliers but would need optimization for larger datasets
- Export is synchronous CSV only (no Excel/XLSX) — sufficient for MVP scale
- Dashboard doesn't show per-source breakdowns (only aggregate counts)
- No pagination cursor on unified browse — offset-based, same as review queue
- Bulk promote has no confirmation dialog — promotes immediately on click

## Follow-ups

- none (S05 completes the M001 MVP)

## Files Created/Modified

- `backend/app/routers/unified.py` — new router with 7 endpoints (browse, detail, singletons, export, dashboard)
- `backend/app/schemas/unified.py` — new Pydantic v2 schemas for unified, singleton, dashboard
- `backend/app/main.py` — registered unified router
- `backend/tests/test_unified.py` — 16 tests
- `frontend/src/pages/Dashboard.tsx` — dashboard with stat cards, progress bars, activity feed
- `frontend/src/pages/UnifiedSuppliers.tsx` — unified browse + singletons tabbed interface
- `frontend/src/pages/UnifiedSupplierDetail.tsx` — detail with provenance badges and audit trail
- `frontend/src/App.tsx` — added routes for dashboard, unified, unified detail; updated default redirect
- `frontend/src/components/Layout.tsx` — added Dashboard and Unified nav items, reordered
- `frontend/src/api/types.ts` — added unified, singleton, dashboard type interfaces

## Forward Intelligence

### What the next slice should know
- M001 MVP is complete — all five slices delivered
- The unified router is the final API surface: /api/unified/* covers browse, detail, singletons, export, dashboard
- All audit trail entries (merge_confirmed, match_rejected, match_skipped, singleton_promoted, unified_exported) feed into the dashboard activity feed

### What's fragile
- Singleton detection uses _get_singleton_ids() and _get_already_unified_ids() which scan full tables — profile if scaling past 10K suppliers
- CANONICAL_FIELDS constant in merge.py is the single source of truth for field comparison/provenance — adding new fields requires updating this list

### Authoritative diagnostics
- `GET /api/unified/dashboard` — single source of truth for operational health across all pipeline stages
- `backend/tests/test_unified.py` — 16 tests covering all new API endpoints
- Full test suite (176 tests) remains green — run `python3 -m pytest tests/ -v` from backend/

### What assumptions changed
- Assumed export would need Excel support — CSV is sufficient for the ~5K supplier scale
- Assumed singleton detection would need a database flag — dynamic computation via set exclusion works cleanly
