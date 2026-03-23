# OneBase — Project Files Reference

## Root Directory

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Instructions for Claude Code AI assistant — tech stack, commands, architecture overview |
| `README.md` | Project readme |
| `design.md` | Frontend design prototype (HTML mockup for Light Glassmorphism theme) |
| `docker-compose.yml` | Docker Compose config — spins up postgres, redis, api, worker, and frontend services |
| `.env` | Environment variables: DB credentials, JWT secret, admin login, Redis URL |
| `.env.example` | Template for `.env` |
| `.gitignore` | Git ignore rules |
| `skills-lock.json` | Lock file for AI agent skills/plugins |
| `sample1.csv` | Sample supplier CSV for testing uploads |
| `FournisseurEOT.csv` | Real supplier data file (EOT source) |
| `FournisseurTTEI.csv` | Real supplier data file (TTEI source) |

---

## `backend/` — Python FastAPI Server

### Entry Points

| File | Purpose |
|------|---------|
| `app/main.py` | FastAPI application factory — mounts all routers, CORS config, startup hooks (auto-creates admin user) |
| `app/config.py` | Settings via environment variables (DATABASE_URL, REDIS_URL, JWT_SECRET, etc.) |
| `app/database.py` | SQLAlchemy engine + session factory, creates DB tables on import |
| `app/dependencies.py` | FastAPI dependency injection — `get_db()` (DB session), `get_current_user()` (JWT auth) |
| `Dockerfile` | Container build for the API server |
| `entrypoint.sh` | Docker entrypoint — runs Alembic migrations then starts uvicorn |
| `requirements.txt` | Python package dependencies |
| `pytest.ini` | Pytest configuration |
| `alembic.ini` | Alembic migration config (points to DATABASE_URL) |

### `app/models/` — SQLAlchemy ORM Models

| File | Purpose |
|------|---------|
| `base.py` | Declarative base class for all models |
| `user.py` | `User` — username, hashed password, is_active flag |
| `source.py` | `DataSource` — named data source with column_mapping JSON (maps CSV headers to canonical fields) |
| `batch.py` | `ImportBatch` — one CSV upload: filename, row_count, status, linked to DataSource |
| `staging.py` | `StagedSupplier` — individual supplier row from a CSV, with normalized fields + 384-dim `name_embedding` vector |
| `match.py` | `MatchGroup` + `MatchCandidate` — groups of potential duplicates and their pairwise comparison scores |
| `unified.py` | `UnifiedSupplier` — golden merged record with field-level `provenance` JSON tracking which source each field came from |
| `audit.py` | `AuditLog` — tracks all review actions (merge, reject, skip, promote) with timestamps and user |

### `app/routers/` — API Route Handlers (all prefixed `/api/`)

| File | Purpose |
|------|---------|
| `auth.py` | `POST /api/auth/login` (returns JWT), `GET /api/auth/me`, `POST /api/auth/users` (create user) |
| `sources.py` | CRUD for data sources — list, create, update, delete. Includes column mapping management |
| `upload.py` | `POST /api/upload/{source_id}` — accepts CSV file, creates ImportBatch, triggers Celery ingestion task |
| `matching.py` | `POST /api/matching/run` — triggers matching pipeline, `POST /api/matching/retrain` — optimizes signal weights, `GET /api/matching/stats` |
| `review.py` | Review queue: list candidates with filters, get detail with field comparisons, `POST merge/reject/skip` actions |
| `unified.py` | Browse unified suppliers, singleton list, promote singletons, bulk promote, CSV export |
| `users.py` | `GET /api/users` — list all users |
| `ws.py` | WebSocket endpoint `/ws` — pushes real-time matching completion/failure notifications to connected clients |

### `app/schemas/` — Pydantic Request/Response Models

| File | Purpose |
|------|---------|
| `auth.py` | `LoginRequest`, `TokenResponse`, `UserResponse`, `UserCreate` |
| `source.py` | `DataSourceCreate`, `DataSourceUpdate`, `DataSourceResponse`, `ColumnMapping` |
| `upload.py` | `UploadResponse`, `BatchStatusResponse`, `BatchResponse` |
| `matching.py` | `MatchingRunRequest`, `MatchingStatsResponse`, `DashboardResponse` |
| `review.py` | `ReviewQueueResponse`, `MatchDetailResponse`, `FieldComparison`, `FieldSelection`, `ReviewActionResponse` |
| `unified.py` | `UnifiedSupplierResponse`, `UnifiedSupplierDetail`, `SingletonResponse`, `FieldProvenance` |

### `app/services/` — Business Logic

| File | Purpose |
|------|---------|
| `auth.py` | Password hashing (bcrypt), JWT token creation/verification (HS256) |
| `ingestion.py` | Parses uploaded CSV using DataSource column_mapping, normalizes fields, inserts StagedSupplier rows |
| `normalization.py` | Text normalization — lowercase, strip whitespace, standardize company suffixes (Ltd, Inc, etc.) |
| `embedding.py` | Generates 384-dim sentence embeddings using `all-MiniLM-L6-v2` model for supplier name similarity |
| `blocking.py` | Candidate pair generation — text token overlap + pgvector HNSW nearest-neighbor search to find potential duplicates |
| `scoring.py` | Multi-signal confidence scoring: jaro-winkler (0.30), token-jaccard (0.20), embedding-cosine (0.25), short-name (0.10), currency (0.05), contact (0.10) |
| `clustering.py` | Transitive closure — groups related candidate pairs into MatchGroups |
| `matching.py` | Orchestrates the full matching pipeline: blocking → scoring → clustering → insert candidates |
| `merge.py` | Creates UnifiedSupplier from confirmed match — resolves field conflicts using reviewer selections, writes provenance JSON |
| `source.py` | DataSource CRUD logic, handles re-upload (marks old staged records as superseded) |
| `retraining.py` | Optimizes signal weights from confirmed/rejected review decisions (requires 20+ reviews) |
| `audit.py` | Writes AuditLog entries for all review actions |
| `notifications.py` | WebSocket notification manager — broadcasts matching results to connected clients |

### `app/tasks/` — Celery Background Tasks

| File | Purpose |
|------|---------|
| `celery_app.py` | Celery app config — Redis broker, task serialization settings |
| `ingestion.py` | `process_upload` task — runs ingestion service, reports progress via Celery state updates, auto-triggers matching |
| `matching.py` | `run_matching` task — runs full matching pipeline (blocking + scoring + clustering), sends WebSocket notification on completion |

### `app/utils/`

| File | Purpose |
|------|---------|
| `csv_parser.py` | CSV file reader with encoding detection and delimiter sniffing |

### `alembic/versions/` — Database Migrations

| File | Purpose |
|------|---------|
| `001_initial_schema.py` | Creates users, data_sources, import_batches, staged_suppliers tables + pgvector extension |
| `002_matching_engine.py` | Adds match_groups, match_candidates tables + HNSW index on name_embedding |
| `003_unified_suppliers.py` | Adds unified_suppliers, audit_logs tables |

### `tests/` — Backend Test Suite (176 tests, SQLite by default)

| File | Purpose |
|------|---------|
| `conftest.py` | Test fixtures — in-memory SQLite DB, test client, auth token, sample data factories |
| `test_auth.py` | Login, JWT validation, user creation, password hashing |
| `test_sources.py` | DataSource CRUD, column mapping validation |
| `test_upload.py` | CSV upload, batch creation, file handling |
| `test_csv_parser.py` | CSV parsing edge cases (encodings, delimiters, malformed files) |
| `test_ingestion_task.py` | Celery ingestion task — normalization, staged supplier creation |
| `test_normalization.py` | Text normalization rules |
| `test_embedding.py` | Embedding generation, vector dimensions |
| `test_blocking.py` | Candidate pair generation logic |
| `test_scoring.py` | Multi-signal scoring accuracy |
| `test_clustering.py` | Transitive closure grouping |
| `test_matching_api.py` | Matching API endpoints |
| `test_matching_service.py` | End-to-end matching pipeline |
| `test_review_merge.py` | Review actions (confirm, reject, skip) and merge logic |
| `test_reupload.py` | Re-upload handling — superseding old records |
| `test_unified.py` | Unified supplier queries, singleton promotion, CSV export |
| `test_audit.py` | Audit log creation and retrieval |
| `test_ws.py` | WebSocket connection and notification delivery |
| `test_config.py` | Configuration loading and defaults |

### `data/uploads/`

Stored CSV files from user uploads (UUID-named). These are the raw files referenced by ImportBatch records.

---

## `frontend/` — React + TypeScript + Vite

### Build & Config

| File | Purpose |
|------|---------|
| `package.json` | Dependencies: React 19, TanStack Query, React Router v7, Tailwind CSS v4 |
| `package-lock.json` | Locked dependency versions |
| `vite.config.ts` | Vite config — dev proxy (`/api` → `:8000`, `/ws` → `ws://:8000`) |
| `tsconfig.json` | Root TypeScript config (references app + node configs) |
| `tsconfig.app.json` | App TypeScript config — strict mode, JSX, path aliases |
| `tsconfig.node.json` | Node/Vite TypeScript config |
| `eslint.config.js` | ESLint rules for React + TypeScript |
| `index.html` | HTML entry — loads Manrope + Inter fonts, Material Symbols Outlined icons |
| `Dockerfile` | Multi-stage build: npm build → nginx serve |
| `nginx.conf` | Nginx config for production — serves SPA, proxies `/api` and `/ws` to backend |
| `mockup-design.html` | Static HTML design mockup (reference only) |

### `src/` — Application Source

| File | Purpose |
|------|---------|
| `main.tsx` | React entry point — renders `<App />` into `#root` |
| `App.tsx` | Router setup — defines all routes, wraps in QueryClient + AuthProvider + ErrorBoundary |
| `app.css` | Design system — Tailwind v4 `@theme` tokens, glass card utilities, animations, component base styles |
| `vite-env.d.ts` | Vite TypeScript ambient types |

### `src/api/` — API Client Layer

| File | Purpose |
|------|---------|
| `client.ts` | Typed fetch wrapper — attaches JWT from `localStorage('onebase_token')`, auto-redirects on 401, `ApiError` class |
| `types.ts` | TypeScript interfaces mirroring backend Pydantic schemas (User, DataSource, BatchResponse, MatchCandidate, UnifiedSupplier, etc.) |

### `src/hooks/` — React Hooks

| File | Purpose |
|------|---------|
| `useAuth.tsx` | `AuthProvider` context — login (stores JWT), logout (clears JWT), `GET /api/auth/me` on mount, exposes `user`, `isAuthenticated`, `isLoading` |
| `useTaskStatus.ts` | Polls `GET /api/import/batches/{taskId}/status` every 2s — tracks Celery task state, stage, progress percentage, row count |
| `useMatchingNotifications.ts` | WebSocket hook — connects to `/ws`, handles reconnection with exponential backoff, heartbeat dedup, calls notification callback on matching events |

### `src/components/` — Shared UI Components

| File | Purpose |
|------|---------|
| `Layout.tsx` | App shell — narrow icon sidebar (glass), top navbar with brand/notifications/profile, renders `<Outlet />` for page content, wires WebSocket notifications to toast system |
| `Toast.tsx` | Toast notification system — glass-morphic slide-up toasts with auto-dismiss, success/error/info variants, action links |
| `ErrorBoundary.tsx` | React error boundary — catches render errors, shows retry button |
| `ProtectedRoute.tsx` | Auth guard — redirects to `/login` if not authenticated, shows loading spinner while checking |
| `DropZone.tsx` | Drag-and-drop file upload zone — visual feedback for drag-over/accepted states, file type validation |
| `ColumnMapper.tsx` | Two-step column mapping wizard — name the source, then map CSV columns to canonical fields (supplier_name, supplier_code, etc.) |
| `ProgressTracker.tsx` | Real-time pipeline progress — 5-stage horizontal tracker (Parsing → Normalizing → Embedding → Match Enqueued → Matching) with animated connecting lines |
| `BatchHistory.tsx` | Upload history table for a data source — shows filename, uploader, row count, status badge, date |
| `ReUploadDialog.tsx` | Confirmation modal for re-uploading to a source that already has data — warns about superseding existing records |

### `src/pages/` — Route Pages

| File | Purpose |
|------|---------|
| `Login.tsx` | Login form — username/password, calls `POST /api/auth/login`, stores JWT, redirects to dashboard |
| `Dashboard.tsx` | Overview — stat cards (total sources, pending reviews, processing, unified count), upload progress bars, recent activity feed |
| `Upload.tsx` | Upload workflow state machine: Select Source → Upload File (DropZone) → Map Columns (ColumnMapper, for new sources) → Processing (ProgressTracker). Handles re-upload detection |
| `Sources.tsx` | Data source management — card grid with CRUD. SourceModal for create/edit, DeleteConfirm modal, inline column mapping editor, BatchHistory per source |
| `ReviewQueue.tsx` | Filterable queue of match candidates — table with confidence badges, status filters (pending/confirmed/rejected), click-through to detail |
| `ReviewDetail.tsx` | Match review workspace — confidence ring, signal breakdown bars, side-by-side field comparison grid with conflict resolution radio buttons, merge/reject/skip actions |
| `UnifiedSuppliers.tsx` | Tabbed view: Unified Records table (name, code, type, currency, source count) + Singletons tab with bulk promote. CSV export button |
| `UnifiedSupplierDetail.tsx` | Single unified supplier — field values with provenance tags (showing which source each field came from), source records list, audit trail |
| `Users.tsx` | User management — table with avatar, active status badge, creation date. CreateUserModal for adding new users |

### `public/`

| File | Purpose |
|------|---------|
| `favicon.svg` | Browser tab icon |

---

## `docs/`

| File | Purpose |
|------|---------|
| `superpowers/specs/2026-03-15-bug-hunt-design.md` | Bug hunt planning spec — lists 40+ identified issues across backend and frontend |

---

## Tooling Directories (not application code)

| Directory | Purpose |
|-----------|---------|
| `.gsd/` | GSD (Get Stuff Done) AI agent workspace — milestone/slice/task planning documents, activity logs, completion tracking |
| `.opencode/` | OpenCode AI agent definitions — 140+ specialized agent profiles (not used by the app itself) |
| `.agents/skills/` | AI skill definitions (frontend-design skill used for the glassmorphism redesign) |
| `.bg-shell/` | Background shell process manifest |
| `.ruff_cache/` | Ruff Python linter cache |
| `.pytest_cache/` | Pytest result cache |
