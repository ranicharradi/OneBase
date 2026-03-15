# Phase 3: Review + Merge - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Reviewers can examine pending match candidates, compare suppliers side-by-side with field-level conflict highlighting, and merge them field-by-field into golden records with full provenance. This phase delivers the review queue, the match detail/merge page, and the unified_suppliers table with provenance. Browse/dashboard features (UNIF-03, UNIF-04, UNIF-05, UNIF-06, OPS-01) are Phase 4.

Requirements in scope: REVW-01, REVW-02, REVW-03, REVW-04, REVW-05, REVW-06, REVW-07, REVW-08, UNIF-01, UNIF-02.

</domain>

<decisions>
## Implementation Decisions

### Review queue layout
- Dense table layout — scannable rows, not cards
- Columns: supplier A name, supplier B name, source pair (e.g. EOT → TTEI), confidence score, status badge
- Filters: status (pending/confirmed/rejected/skipped), source pair, confidence range (min slider). Default sort: confidence descending
- Clicking a row navigates to a full-page /review/:id detail page (not a drawer or inline expand)

### Side-by-side comparison detail
- Display key fields first (7 canonical: supplier_name, supplier_code, short_name, currency, payment_terms, contact_name, supplier_type)
- Followed by a collapsible "All fields" section showing everything from raw_data (200+ columns)
- Field conflict visual: row color by conflict type — conflict rows amber/orange tint, identical rows neutral, source-only rows subtle tint. No icons needed
- Signal breakdown: collapsible panel above the field comparison — 6 signal names with scores as labeled bars or percentage pills, collapsed by default
- Navigation: Prev / Next buttons on the detail page to move between pending candidates without returning to queue

### Merge field selection UX
- Radio buttons per conflicting field — one under each supplier column, reviewer clicks the value they want
- Confirm Merge button disabled until all conflicting fields have a radio selection; status hint shows "3 of 5 fields resolved"
- Three actions: Confirm Merge (green), Reject (red), Skip for Later (secondary/muted)
- After Confirm or Reject: auto-advance to next pending candidate. After Skip: stay on page, record is marked skipped
- Identical fields (REVW-07) and source-only fields (REVW-08) are auto-handled — no reviewer input needed for those

### Golden record + provenance data model
- unified_suppliers table: scalar columns matching StagedSupplier key fields (name, source_code, short_name, currency, payment_terms, contact_name, supplier_type) + raw_data JSONB for all remaining fields
- Provenance stored as field_provenance JSONB column on unified_suppliers: `{"supplier_name": {"source": "EOT", "supplier_id": 42, "chosen_by": "alice", "chosen_at": "..."}}`
- unified_suppliers.match_candidate_id: FK to the MatchCandidate that triggered the merge (Phase 4 will add full merge history UI/table)
- After merge confirmed: source StagedSupplier records marked status = 'merged'; match candidate status changes from 'pending' to 'confirmed' (already exists in MatchCandidate.status)
- Phase 3 exposes: POST /api/review/:id/confirm, POST /api/review/:id/reject, POST /api/review/:id/skip, GET /api/unified/:id. No list/browse endpoint — Phase 4 adds that

### Claude's Discretion
- Exact visual design of the review queue table (row hover states, status badge colors, confidence display format)
- Layout of the signal breakdown panel (bar chart vs pill chips vs labeled numbers)
- Exact amber/orange shade for conflict row highlighting (within the existing dark theme color system)
- Pagination vs virtual scrolling for the queue table
- Error handling and loading states on the review detail page
- How "all fields" in the collapsible section are grouped or labeled (raw CSV headers vs canonical names where available)

</decisions>

<specifics>
## Specific Ideas

- The Confirm Merge button should be visually prominent — green, full-width or large — to make the primary action clear after all conflicts are resolved
- The "3 of 5 fields resolved" counter should update live as the reviewer makes selections, giving a sense of progress
- The signal breakdown panel label should show the overall confidence score prominently (e.g. "Confidence: 0.94 ▾") so it's useful even when collapsed

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `MatchCandidate` model (`backend/app/models/match.py`): Has `confidence`, `match_signals` (JSON with 6 signals), `status` (pending/confirmed/rejected/skipped/invalidated), `reviewed_by`, `reviewed_at`, `group_id`. Ready to use as-is.
- `StagedSupplier` model (`backend/app/models/staging.py`): Has all 7 canonical key fields + `raw_data` JSONB (full CSV row) + `data_source_id` (for source entity label). `status` field needs 'merged' added to its enum.
- `/api/matching/candidates` endpoint (`backend/app/routers/matching.py`): Already supports filtering by status, group_id, min_confidence. Returns supplier names (batch-loaded). Use this as the basis for the review queue API.
- `log_action()` service (`backend/app/services/audit.py`): Call on every confirm/reject/skip action.
- `useQuery` / `useMutation` (TanStack Query): The established frontend data fetching pattern — use for all review page data loading and action mutations.
- `Toast` component (`frontend/src/components/Toast.tsx`): Use for success/error feedback after merge confirm/reject actions.
- `Layout.tsx` with sidebar nav: Add a "Review" nav item pointing to /review.

### Established Patterns
- Dark Precision Editorial aesthetic: dark theme, cyan accent #06b6d4, Instrument Serif (display) + Outfit (body), glass-morphic panels — apply consistently to all new pages
- Sync SQLAlchemy + Pydantic v2 schemas (`model_config = ConfigDict(from_attributes=True)`) — follow pattern in `backend/app/schemas/matching.py`
- FastAPI routers in `backend/app/routers/` with `/api/` prefix and `get_current_user` dependency
- `frontend-design` skill: use for ALL new React pages and components

### Integration Points
- New router: `backend/app/routers/review.py` — review queue list, detail fetch, confirm/reject/skip actions, unified record GET
- New model: `backend/app/models/unified.py` — `UnifiedSupplier` with key fields + `raw_data` JSONB + `field_provenance` JSONB + `match_candidate_id` FK
- New Alembic migration (003): create `unified_suppliers` table, add 'merged' to StagedSupplier status column
- Frontend: new pages `Review.tsx` (queue) and `ReviewDetail.tsx` (detail/merge), new `/review` and `/review/:id` routes
- Sidebar nav (`Layout.tsx`): add Review link between Upload and Sources

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-review-merge*
*Context gathered: 2026-03-15*
