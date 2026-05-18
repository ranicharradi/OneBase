# OneBase — Full Architecture Guide

OneBase is a **records unification platform**: you feed it CSV files from many systems (ERPs, banks, supplier lists), it figures out which rows are the *same real-world entity*, lets a human review the uncertain ones, and produces one clean "golden" record per entity.

Below I explain the **stack**, **why each tool is used**, the **folder layout**, and the **workflow** from CSV upload to golden record.

---

## 1. The Stack — what is used and why

The project has **two big halves** that talk to each other:

| Half | Language | What it does |
|------|----------|--------------|
| **Backend** (`backend/`) | Python 3.12 | Stores data, runs the matching algorithms, exposes the API |
| **Frontend** (`frontend/`) | TypeScript + React 19 | The web UI you click around in |

They are tied together with **Docker Compose** (`docker-compose.yml`) which also starts the database and the queue.

### 1.1 Backend stack

| Tool | Role | Why this one |
|------|------|--------------|
| **FastAPI 0.135** | Web framework (the thing that handles HTTP requests like `/api/login`) | Fast, modern, gives you free OpenAPI docs, and uses Python type hints for input validation |
| **Uvicorn** | Web server (ASGI server) | The actual program that runs FastAPI and listens on port 8000 |
| **SQLAlchemy 2.0** | Database toolkit (ORM) | Lets you write Python classes instead of raw SQL; safer and easier |
| **Alembic** | Database migrations | When you change a table, Alembic writes a versioned script to update existing databases |
| **PostgreSQL 16** | Main database | Reliable SQL database; OneBase needs transactions, joins, JSON, and… |
| **pgvector** | PostgreSQL extension for vector search | Stores 384-dimension "meaning vectors" (embeddings) and finds nearest neighbors using an HNSW index — essential for fuzzy duplicate-finding |
| **Pydantic v2 + pydantic-settings** | Data validation & config loader | Turns JSON request bodies into typed Python objects and loads `.env` into `settings` |
| **Celery 5.6** | Background job queue (task queue) | Heavy work (parsing huge CSVs, computing matches) must not block the API; Celery runs them in a separate `worker` process |
| **Redis 7** | Message broker + result store for Celery | Stores the job list and the results; also small/fast cache |
| **sentence-transformers (all-MiniLM-L6-v2)** | Generates 384-dim text embeddings | Turns "Acme Corporation" and "ACME Corp." into similar numeric vectors so cosine similarity finds them as related |
| **PyTorch CPU build** | Runs the embedding model | Pinned to CPU-only build to keep the image small (no GPU needed) |
| **rapidfuzz** | Fast fuzzy string matching (Jaro-Winkler, token Jaccard) | Catches typos like "Acme" vs "Acmee" |
| **LightGBM + scikit-learn** | Machine-learning classifier | After enough human reviews, trains a model that *replaces* the hand-tuned scoring weights |
| **PyJWT** | JSON Web Tokens | Lets the frontend log in and prove identity on every request |
| **bcrypt** | Password hashing | Never store plaintext passwords |
| **slowapi** | Rate limiting | Stops abuse of login / API endpoints |
| **google-genai (Gemini)** | LLM for the "Ask" feature | Lets users ask the data in natural language |
| **sqlglot** + `sql_guard.py` | SQL parser/validator | Makes sure the LLM only returns safe read-only `SELECT` statements |
| **openpyxl** | Reads Excel files | Supports `.xlsx` uploads as well as `.csv` |
| **pytest + pytest-xdist + pytest-cov** | Testing (parallel + coverage) | Big test suite under `backend/tests/` |
| **Ruff** | Linter + formatter | One tool replaces flake8 + isort + black |
| **uv** | Python package manager | Much faster than pip; lockfile is `uv.lock` |

### 1.2 Frontend stack

| Tool | Role | Why |
|------|------|-----|
| **React 19** | UI library | Component-based UI |
| **TypeScript 5.9** | Typed JavaScript | Catches mistakes before runtime |
| **Vite 8 (Rolldown)** | Dev server + bundler | Instant hot-reload in dev, fast production builds |
| **React Router v7** | Page routing | URLs like `/review`, `/upload` map to components |
| **TanStack Query (React Query) v5** | Server-state cache | Handles fetching, caching, retries for all API calls |
| **Tailwind CSS v4** | Styling | Utility-class CSS, fast to write |
| **Vitest + @testing-library/react + jsdom** | Testing | Unit-tests for components and hooks |
| **ESLint 9 + typescript-eslint** | Linting | Catches code-quality issues |
| **Nginx** (production) | Web server inside Docker | Serves the built static files and proxies `/api` and `/ws` to the backend |

### 1.3 Infrastructure / glue

| Tool | Role |
|------|------|
| **Docker + Docker Compose** | Runs all five services (`postgres`, `redis`, `api`, `worker`, `frontend`) with one command |
| **Makefile** | Shortcut commands for common dev tasks |
| **pre-commit** (`.pre-commit-config.yaml`) | Runs Ruff before each Git commit so bad code never lands |
| **GitHub Actions** (`.github/`) | CI pipeline (tests on push) |

---

## 2. Project Architecture — folder by folder

### 2.1 Root of the repo
```
OneBase/
├── backend/ ← Python API + worker
├── frontend/ ← React UI
├── docker-compose.yml ← Production stack (5 services)
├── docker-compose.dev.yml ← Dev overlay (exposes DB/Redis ports)
├── .env.example ← Template for secrets/config
├── .editorconfig ← Code style for all editors
├── .pre-commit-config.yaml ← Git pre-commit hooks
├── Makefile ← Common dev shortcuts
├── README.md, CONTRIBUTING.md ← Docs
└── .github/ ← CI workflows
```

### 2.2 Backend (`backend/`)
```
backend/
├── Dockerfile ← Builds the API + worker image
├── entrypoint.sh ← Container startup: run migrations, then app
├── pyproject.toml ← Python deps + Ruff config
├── requirements.txt ← Frozen deps (for Docker build)
├── uv.lock ← Exact dep versions
├── pytest.ini ← Test runner config
├── alembic.ini ← Migration tool config
├── alembic/ ← Database schema versioning
│   ├── env.py ← Wires Alembic to SQLAlchemy models
│   ├── script.py.mako ← Template for new migrations
│   └── versions/ ← One Python file per schema change
│       ├── 001_initial_schema.py
│       ├── 002_rename_comparison_to_match.py
│       ├── 003_drop_dead_source_columns.py
│       └── 004_files_datasources_redesign.py
├── scripts/ ← One-off admin/maintenance scripts
│   ├── backfill_dq.py ← Recompute data-quality scores
│   ├── backfill_unified_embeddings.py ← Recompute vectors
│   └── seed_record_type_sources.py ← Initial seed data
├── tests/ ← ~80 pytest files, one per feature
│   ├── conftest.py ← Shared fixtures (DB, auth tokens, etc.)
│   └── test_.py ← Each tests one router/service/model
└── app/ ← THE ACTUAL APP
    ├── main.py ← FastAPI entry: middleware + router mounting + lifespan
    ├── config.py ← Settings loaded from .env via Pydantic
    ├── database.py ← SQLAlchemy engine + SessionLocal factory
    ├── dependencies.py ← Shared FastAPI dependencies (get_db, get_current_user…)
    ├── logging_config.py ← Structured JSON logging + RequestID middleware
    ├── rate_limit.py ← slowapi limiter instance
    ├── models/ ← SQLAlchemy ORM models (= database tables)
    │   ├── base.py ← Declarative Base class
    │   ├── enums.py ← Shared enums (status, role…)
    │   ├── user.py ← User accounts + roles
    │   ├── source.py ← Configured data sources (ERP, SAP…)
    │   ├── batch.py ← One upload = one batch
    │   ├── staging.py ← Raw imported rows
    │   ├── match.py ← Candidate pair scores
    │   ├── match_run.py ← One batch matching execution
    │   ├── unified.py ← Golden records + per-field provenance
    │   ├── file_check.py ← Pre-ingest data-quality reports
    │   ├── ml_model.py ← Saved LightGBM model versions
    │   └── audit.py ← Audit-trail log
    ├── schemas/ ← Pydantic models = API request/response shapes
    │   ├── auth.py, upload.py, review.py, match.py, …
    │   └── (one file per area, mirrors routers/)
    ├── routers/ ← FastAPI endpoints (the URLs)
    │   ├── auth.py ← /api/auth/login, /me
    │   ├── users.py ← /api/users (CRUD admin)
    │   ├── sources.py ← /api/sources (configure column mapping)
    │   ├── upload.py ← /api/import/upload, /batches
    │   ├── file_checks.py ← /api/file-checks (validate before ingest)
    │   ├── matching.py ← /api/matching/ (trigger runs, retrain)
    │   ├── matches.py ← /api/comparisons (custom match jobs)
    │   ├── review.py ← /api/review/queue, confirm/reject/merge
    │   ├── unified.py ← /api/unified/records (golden records)
    │   ├── dashboard.py ← /api/dashboard stats
    │   ├── insights.py ← /api/insights/* charts
    │   ├── record_types.py ← /api/record-types (supplier, bank, client…)
    │   ├── ask.py ← /api/ask (LLM natural-language Q&A)
    │   └── ws.py ← WebSocket /ws for live progress
    ├── services/ ← Business logic (called BY routers, no HTTP here)
    │   ├── ingestion.py ← Parse CSV → staging rows + normalization
    │   ├── normalization.py ← Lowercase, strip punctuation, expand abbrev.
    │   ├── embedding.py ← Load sentence-transformer + encode rows
    │   ├── blocking.py ← Find candidate pairs via pgvector HNSW
    │   ├── scoring.py ← Weighted-sum of similarity signals
    │   ├── matching.py ← Orchestrates blocking + scoring per batch
    │   ├── clustering.py ← Group transitively-matching pairs
    │   ├── grouping.py ← Within-source dedup
    │   ├── merge.py ← Build a unified record from a cluster
    │   ├── match.py ← Custom “compare set A vs set B” jobs
    │   ├── record_set.py ← Helpers for record-set operations
    │   ├── record_lookup.py ← Generic record fetchers
    │   ├── source.py ← Source CRUD logic
    │   ├── auth.py ← JWT issue/verify, create admin user
    │   ├── audit.py ← Write to audit_log
    │   ├── dq.py ← Data-quality scoring
    │   ├── file_check.py ← Pre-upload column/row validation
    │   ├── notifications.py ← Push WebSocket events
    │   ├── singleton.py ← Promote unmatched records to unified singletons
    │   ├── ask_view.py ← Build the read-only view exposed to LLM
    │   ├── llm.py ← Gemini client wrapper
    │   ├── sql_guard.py ← Validates LLM-generated SQL is safe SELECT
    │   └── ml/ ← LightGBM training & inference
    │       ├── features.py ← Build feature vectors from a pair
    │       ├── weights.py ← Recompute signal weights from reviews
    │       ├── train.py ← Train LightGBM from confirmed/rejected pairs
    │       └── score.py ← Use the trained model at match time
    ├── record_types/ ← Plugin-style record type definitions
    │   ├── base.py ← Abstract “RecordType” class
    │   ├── supplier.py ← Supplier fields + scoring strategy
    │   ├── client.py ← Client (customer) variant
    │   └── bank.py ← Bank-account variant
    ├── tasks/ ← Celery background jobs
    │   ├── celery_app.py ← Celery instance (broker = Redis)
    │   ├── ingestion.py ← Async task: parse CSV + embed
    │   └── match.py ← Async task: run matching for a batch
    └── utils/ ← Small helpers
        ├── file_format.py ← Detect CSV vs XLSX
        ├── tabular_parser.py ← Stream-parse big files
        ├── uploads.py ← Save files safely (no path traversal)
        ├── paths.py ← Path helpers
        └── values.py ← Misc value cleaning
```

### 2.3 Frontend (`frontend/`)
```
frontend/
├── Dockerfile ← Multi-stage: npm build → Nginx serve
├── nginx.conf ← Serves the SPA; proxies /api and /ws → api:8000
├── index.html ← The single HTML page
├── package.json ← Scripts + deps
├── vite.config.ts ← Vite plugins + dev proxy to backend
├── vitest.config.ts ← Test runner config (jsdom)
├── eslint.config.js ← Lint rules
├── tsconfig*.json ← TypeScript settings (app / node / test)
├── public/
│   └── favicon.svg
└── src/
    ├── main.tsx ← Entry: mounts on #root
    ├── App.tsx ← Top-level providers + Routes
    ├── app.css ← Tailwind directives + global styles
    ├── vite-env.d.ts ← Type declarations for Vite
    ├── api/ ← Talks to the backend
    │   ├── client.ts ← fetch() wrapper, attaches JWT, throws ApiError
    │   └── types.ts ← Shared TS types mirroring backend schemas
    ├── contexts/ ← React Contexts (global state)
    │   ├── RecordTypeContext.tsx ← Currently-selected record type (supplier/bank…)
    │   └── SearchContext.tsx ← Global search query
    ├── hooks/ ← Custom React hooks
    │   ├── useAuth.tsx ← Login/logout, current user
    │   ├── useTheme.tsx ← Light/dark theme toggle
    │   ├── useRecordTypes.ts ← Fetch /api/record-types
    │   ├── useMatchRun.ts ← Trigger and poll a match run
    │   ├── useTaskStatus.ts ← Poll Celery task /status
    │   └── useMatchingNotifications.ts ← Subscribes to WebSocket events
    ├── components/ ← Reusable UI pieces
    │   ├── Layout.tsx ← Sidebar + TopBar +
    │   ├── ProtectedRoute.tsx ← Redirect to /login if not authed
    │   ├── ErrorBoundary.tsx ← Catches React errors
    │   ├── CommandPalette.tsx ← Cmd-K quick nav
    │   ├── DropZone.tsx ← Drag-and-drop file upload
    │   ├── ColumnMapper.tsx ← Map CSV columns → record fields
    │   ├── FieldComparisonPanel.tsx← Side-by-side field comparison
    │   ├── RecordFieldRow.tsx ← One field row inside a record
    │   ├── MatchRunSelect.tsx, MatchSignalsPanel.tsx
    │   ├── BatchHistory.tsx, ProgressTracker.tsx, QueueBucketTabs.tsx
    │   ├── ReUploadDialog.tsx, HandoffBanner.tsx, UnifiedBadge.tsx
    │   ├── WorkflowStageRail.tsx, Pagination.tsx, Toast.tsx
    │   ├── layout/ ← Sidebar, TopBar, AvatarMenu
    │   └── ui/ ← Tiny design-system primitives
    │       ├── Panel, Modal, Spinner, Pill, Kpi, Hbar,
    │       │   Seg (segmented), SourcePill, IdChip, Icon,
    │       │   ConfMini (confidence bar), LoadingErrorEmpty
    │       └── index.ts ← Barrel re-exports
    ├── pages/ ← One file per route in App.tsx
    │   ├── Login.tsx ← /login
    │   ├── Dashboard.tsx ← /dashboard (KPIs)
    │   ├── Upload.tsx ← /upload (drag CSV)
    │   ├── FileChecker.tsx ← /file-checker (pre-upload validation)
    │   ├── Sources.tsx ← /sources (configure column mappings)
    │   ├── ReviewQueue.tsx + ReviewDetail.tsx ← Human-in-the-loop review
    │   ├── MergeQueue.tsx + MergeDetail.tsx ← Confirm & merge
    │   ├── UnifiedRecords.tsx + UnifiedRecordDetail.tsx ← Golden records
    │   ├── Match.tsx ← Run a custom comparison
    │   ├── History.tsx ← Past batches & runs
    │   ├── Insights.tsx ← Charts
    │   ├── Ask.tsx ← Natural-language Q&A (LLM)
    │   └── Users.tsx ← Admin user management
    ├── utils/ ← Pure helpers (no React)
    │   ├── confidence.ts, signals.ts ← Format scoring info
    │   ├── fileFormat.ts, fileHeaders.ts ← CSV header sniffing
    │   ├── filename.ts, filesize.ts, time.ts ← Display formatting
    │   ├── matchRuns.ts ← Status helpers
    │   └── recordDisplay.ts ← Pretty-print records
    └── test/ ← Vitest setup
        ├── setup.ts ← @testing-library/jest-dom hookup
        ├── test-utils.tsx ← Custom render() wrapping providers
        └── setup.test.ts
```

---

## 3. The Workflow — what happens, step by step

Here is the journey of one CSV from your desktop to a clean "golden" record.
```
[Browser]
  → [Nginx :3000]
  → [FastAPI :8000]
  → [Postgres + pgvector] ↓ [Redis (queue)] ↓ [Celery worker] ↓ [Postgres (writes results)] ↓ [WebSocket
  → Browser]
```

### Step 0 — Boot

1. `docker-compose up -d` starts five containers:
   - `postgres` (database with `pgvector` enabled)
   - `redis` (queue)
   - `api` (FastAPI on 8000) — runs `entrypoint.sh` → applies Alembic migrations → starts Uvicorn
   - `worker` (Celery)
   - `frontend` (Nginx on 3000 serving the React build)
2. On API startup, `main.py`'s `lifespan` hook **creates the initial admin user** and **refreshes the SQL view** used by the Ask LLM feature.

### Step 1 — Login

1. User opens `http://localhost:3000` → Nginx serves `index.html` + the React bundle.
2. `main.tsx` mounts `<App/>`, which sets up:
   - `QueryClientProvider` (React Query cache)
   - `AuthProvider` (reads JWT from `localStorage`)
   - `<BrowserRouter>` with all routes
3. Because the user isn't logged in, `ProtectedRoute` redirects to `/login`.
4. `Login.tsx` calls `POST /api/auth/login` via `api/client.ts`.
5. Backend: `routers/auth.py` → `services/auth.py` checks bcrypt hash → returns a **JWT**.
6. The frontend stores the JWT; every later `fetch` includes `Authorization: Bearer <token>`.

### Step 2 — Configure a source

1. User goes to **Sources** page.
2. They tell the system "for ERP files, the column `VENDOR_NAME` is our `name` field, `TAX_NUMBER` is `tax_id`, etc."
3. `POST /api/sources` → `routers/sources.py` → saves a `Source` row with its `column_mapping` JSON.

### Step 3 — (Optional) Pre-upload check

1. User drags the CSV in **FileChecker**.
2. `POST /api/file-checks` runs `services/file_check.py` which scans rows for missing required fields, bad encodings, weird column counts.
3. Returns a `FileCheckReport` shown in the UI — user can fix problems before the real upload.

### Step 4 — Upload the CSV

1. User drops the file in **Upload** page (`DropZone.tsx`).
2. Frontend sends `multipart/form-data` to `POST /api/import/upload` with `source_id` and the file.
3. `routers/upload.py`:
   - Saves the file under `/app/data/uploads/...` (validated by `utils/uploads.py` to prevent path-traversal attacks)
   - Creates a `Batch` row with status `pending`
   - **Queues a Celery task** `tasks/ingestion.py:ingest_batch`
   - Returns `{ task_id, batch_id }` immediately (non-blocking)
4. Frontend uses `useTaskStatus` to poll `/api/import/batches/<id>/status`, **and** subscribes to the WebSocket at `/ws?token=...` (via `useMatchingNotifications`) for live progress.

### Step 5 — Ingestion (in the Celery worker)

The worker picks up the job from Redis and runs `services/ingestion.py`:

1. **Parse** the CSV/XLSX via `utils/tabular_parser.py` (streams the file, doesn't load it all in memory).
2. For each row, **map** raw column → canonical field using the source's `column_mapping`.
3. **Normalize** the values with `services/normalization.py` (lowercase, strip punctuation, expand "Corp" ↔ "Corporation", normalize phone/IBAN).
4. **Group within-source duplicates** (`services/grouping.py`) so the exact same row isn't ingested twice.
5. **Embed** each record with `services/embedding.py`: the sentence-transformer model turns the concatenated text fields into a 384-dim vector stored in pgvector.
6. **Score data quality** with `services/dq.py`.
7. Write everything as `StagingRecord` rows in PostgreSQL.
8. Push a `ingestion_complete` WebSocket event via `services/notifications.py`.

### Step 6 — Matching (still in the worker)

Triggered automatically after ingestion (or manually via `/api/matching/run`):

1. **Blocking** (`services/blocking.py`): for each new record, use pgvector's HNSW index to find the top-K (default 20) nearest vectors *across all sources*. This avoids comparing every-to-every (O(N²)).
2. **Scoring** (`services/scoring.py`) for each candidate pair, computes weighted signals:
   - Jaro-Winkler on name (rapidfuzz) → weight 0.30
   - Token Jaccard overlap → 0.20
   - Embedding cosine similarity → 0.25
   - Short-name / currency / contact match → 0.10 / 0.05 / 0.10
   - **OR**, if a trained model exists, `services/ml/score.py` uses LightGBM instead.
3. Pairs above `MATCHING_CONFIDENCE_THRESHOLD` (default 0.45) are saved as `Match` rows with status `pending`.
4. **Clustering** (`services/clustering.py`) groups transitively-matched pairs (if A↔B and B↔C, then {A,B,C} is a cluster), capped by `MATCHING_MAX_CLUSTER_SIZE`.
5. Pushes a `matching_complete` WebSocket event.

### Step 7 — Human Review

1. User opens **Review Queue** (`pages/ReviewQueue.tsx`).
2. React Query calls `GET /api/review/queue?page=1` → `routers/review.py` returns pending match candidates.
3. User clicks one → `ReviewDetail.tsx` shows the two records side-by-side using `FieldComparisonPanel` + `RecordFieldRow`, plus `MatchSignalsPanel` (which signals fired and how strongly).
4. User clicks **Confirm** (`POST /api/review/candidates/:id/confirm`) or **Reject** (`/reject`).
5. `routers/review.py` updates the match status and writes an `AuditLog` entry via `services/audit.py`.

### Step 8 — Merge into a unified record

1. After confirmation, user (or auto-merge) goes to **Merge** (`pages/MergeDetail.tsx`).
2. `POST /api/review/candidates/:id/merge` → `services/merge.py`:
   - Creates (or updates) a `UnifiedRecord`.
   - For each field, picks the best source value and records **provenance** — *which source*, *which raw record*, *which reviewer*, *which timestamp*.
   - Result is the "golden record" you can fetch via `GET /api/unified/records/:id`.

### Step 9 — Continuous learning

- Every confirm/reject is training data.
- `POST /api/matching/retrain` recomputes the **linear signal weights** from history.
- `POST /api/matching/train-model` (after 20+ reviews) trains a new **LightGBM** model (`services/ml/train.py`) and saves it as an `MLModel` row.
- Future matching automatically uses the new model.

### Step 10 — Bonus surfaces

- **Dashboard** & **Insights** — read-only stats from `routers/dashboard.py` / `insights.py`.
- **Ask** — user types "How many suppliers in France?" → `routers/ask.py` asks Gemini → Gemini returns SQL → `services/sql_guard.py` validates it's a single safe `SELECT` against the read-only `ask_view` → executes → returns rows.
- **Comparisons** (`/api/comparisons`) — run the matching engine between two arbitrary record sets (e.g., compare batch #5 vs all unified records) as a one-off Celery job.
- **WebSocket** (`routers/ws.py`) — the same channel pushes `ingestion_progress`, `matching_progress`, `matching_complete` so the UI shows real-time progress bars without polling.

---

## 4. Summary in one picture
```
┌────────────────────────────────────────┐
                      │ Browser (React 19 + Vite build)        │
                      │  - React Router pages                  │
                      │  - TanStack Query cache                │
                      │  - WebSocket for live updates          │
                      └──────────────┬─────────────────────────┘
                                     │ HTTP /api  +  WS /ws
                      ┌──────────────▼─────────────────────────┐
                      │ Nginx (prod)  or  Vite dev proxy        │
                      └──────────────┬─────────────────────────┘
                      ┌──────────────▼─────────────────────────┐
                      │ FastAPI (Uvicorn :8000)                │
                      │   routers → schemas → services → models│
                      │   JWT auth, slowapi rate-limit         │
                      └──┬─────────────────────┬───────────────┘
                         │ SQLAlchemy          │ enqueue
          ┌──────────────▼──────┐       ┌──────▼───────┐
          │ PostgreSQL 16       │       │ Redis 7      │
          │  + pgvector (HNSW)  │       │  (broker)    │
          └──────────▲──────────┘       └──────┬───────┘
                     │ writes results          │ pulls jobs
                     │                  ┌──────▼─────────────┐
                     └──────────────────┤ Celery worker      │
                                        │  ingestion.py      │
                                        │  match.py          │
                                        │  uses ML / embed   │
                                        └────────────────────┘
```

That's the whole picture: **React UI** talks to **FastAPI**, FastAPI stores in **Postgres+pgvector**, slow work is pushed via **Redis** to a **Celery worker** that uses **sentence-transformers + rapidfuzz + LightGBM** to find duplicates, and humans confirm them in the **Review** pages, producing **unified records with full provenance**.
