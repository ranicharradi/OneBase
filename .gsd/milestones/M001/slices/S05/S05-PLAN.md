# S05: Unified Browse, Dashboard + Polish

**Goal:** Users can browse the unified supplier database with provenance badges, view merge history, promote singletons, export data, and see operational stats on a dashboard.
**Demo:** User browses unified suppliers with provenance badges showing field origins, views merge history for a record, promotes a singleton supplier, exports the unified database as CSV, and views the dashboard with upload/match/review stats.

## Must-Haves

- [x] Unified suppliers browse endpoint with search + type filtering
- [x] Unified supplier detail endpoint with provenance + source records + merge history
- [x] Singleton detection and listing (suppliers not in any match candidate pair and not already unified)
- [x] Singleton promotion (single + bulk) creating UnifiedSupplier with full provenance
- [x] CSV export with provenance metadata columns
- [x] Dashboard endpoint with upload stats, match stats, review progress, unified stats, recent activity
- [x] Frontend: Dashboard page with stat cards, review progress bars, upload summary, activity feed
- [x] Frontend: Unified Suppliers page with browse table, singletons tab, bulk promote, export button
- [x] Frontend: Unified Supplier Detail page with provenance tags, source records, audit trail
- [x] Updated navigation: Dashboard as landing page, Unified in sidebar
- [x] 16 backend tests covering all new endpoints
- [x] 176 total tests passing (zero regressions)

## Tasks

- [x] **T01: Backend — unified router with browse, detail, singletons, export, dashboard** `est:1h`
- [x] **T02: Frontend — Dashboard, UnifiedSuppliers, UnifiedSupplierDetail pages + routing** `est:1h`

## Files Likely Touched

- `backend/app/routers/unified.py` — new router (browse, detail, singletons, export, dashboard)
- `backend/app/schemas/unified.py` — new schemas
- `backend/app/main.py` — register unified router
- `backend/tests/test_unified.py` — 16 tests
- `frontend/src/pages/Dashboard.tsx` — new
- `frontend/src/pages/UnifiedSuppliers.tsx` — new
- `frontend/src/pages/UnifiedSupplierDetail.tsx` — new
- `frontend/src/App.tsx` — updated routes + imports
- `frontend/src/components/Layout.tsx` — updated nav items
- `frontend/src/api/types.ts` — new type interfaces
