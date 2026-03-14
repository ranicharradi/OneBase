# Phase 2: Matching Engine - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

System automatically finds duplicate supplier candidates across entities using two-pass blocking, multi-signal ML scoring, transitive clustering, and WebSocket job notifications. Users do not interact with matching directly — it auto-triggers after ingestion. The user-visible output is a notification when matching completes. Review UI and merge workflow are Phase 3.

</domain>

<decisions>
## Implementation Decisions

### Matching scope
- Cross-entity only — no within-entity duplicate detection
- All entity pairs compared in a single matching job (with 2 sources = 1 pair; with 5 sources = 10 pairs)
- Matching auto-triggers after ingestion completes (already wired in Phase 1 task chain)
- On re-upload: old match candidates for that source are invalidated, matching regenerates fresh candidates for all pairs involving that source

### Signal scoring
- All 6 signals scored for every candidate pair — no early-exit or tiered scoring
- Signals: Jaro-Winkler, token Jaccard, embedding cosine, short name match, currency match, contact match
- Per-signal breakdowns stored in match_signals JSONB for explainability in Phase 3 review UI

### Job completion notification
- Toast notification (non-blocking, auto-dismiss after a few seconds)
- Content includes stats and link: "Matching complete: 42 candidate pairs found in 3 groups. View results ->"
- If user is on the Upload page watching the progress tracker: matching completion shows as the final inline step (not a separate toast)
- If user navigated away: toast notification appears on whatever page they're on
- On failure: red error toast with error message and retry option

### Claude's Discretion
- Initial confidence threshold cutoff (default value and whether configurable via UI or config-only)
- Signal weight defaults before reviewer feedback exists
- Cluster size limits for transitive grouping (max group size, how to handle oversized clusters)
- Blocking K parameter for pgvector ANN search (20 vs 30 vs 50 — needs empirical tuning)
- WebSocket connection management (heartbeat, reconnection strategy)
- Toast auto-dismiss timing and animation
- How to handle edge cases: zero candidates found, single-supplier entities, identical supplier codes across entities

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `MatchCandidate` model (`backend/app/models/match.py`): Already has `confidence`, `match_signals` (JSON), `status` (pending/confirmed/rejected/skipped/invalidated), `reviewed_by`, `reviewed_at`, unique constraint on (supplier_a_id, supplier_b_id)
- `StagedSupplier` model (`backend/app/models/staging.py`): Has `normalized_name` (B-tree indexed), `name_embedding` (Vector(384) with HNSW index), `short_name`, `currency`, `contact_name`, `status` (active/superseded)
- `run_matching` task stub (`backend/app/tasks/matching.py`): Placeholder ready to implement, already chained from `process_upload` task
- `normalize_name()` service (`backend/app/services/normalization.py`): Uppercase, strip accents, remove 22 legal suffixes, collapse whitespace
- `compute_embeddings()` service (`backend/app/services/embedding.py`): all-MiniLM-L6-v2, 384 dims, L2-normalized, batch_size=64

### Established Patterns
- Sync SQLAlchemy (not async) — matches Celery worker pattern
- Celery tasks use `self.update_state()` for progress reporting (seen in `process_upload`)
- JSON serialization for Celery messages
- `task_acks_late=True` and `task_reject_on_worker_lost=True` for reliability
- Pydantic schemas in `backend/app/schemas/` for request/response validation
- Routers in `backend/app/routers/` with `/api/` prefix

### Integration Points
- Celery worker (`concurrency=2`) shares codebase with API — new services/tasks available to both
- pgvector HNSW index ready for ANN queries with `vector_cosine_ops` (m=16, ef_construction=64)
- No WebSocket infrastructure exists yet — needs new endpoint in FastAPI + Redis pub/sub for worker-to-API communication
- `rapidfuzz` not yet in requirements.txt — needs to be added
- No `MatchGroup` model exists — needs new model/migration for transitive clustering
- Upload page progress tracker (`frontend/src/components/`) needs extension for matching completion step
- Settings in `backend/app/config.py` need matching-specific config (thresholds, weights)

</code_context>

<specifics>
## Specific Ideas

- The progress tracker on the Upload page should seamlessly extend to show matching as the final pipeline step, with the result appearing inline ("Matching complete: 42 pairs found in 3 groups")
- Toast notifications should match the existing dark theme design system (Instrument Serif + Outfit fonts, cyan accent #06b6d4)
- The "View results" link in the notification should point to the review queue (Phase 3 page) — even if that page doesn't exist yet, the route should be established

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-matching-engine*
*Context gathered: 2026-03-14*
