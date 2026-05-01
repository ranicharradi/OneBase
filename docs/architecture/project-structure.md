# OneBase — Project Structure

## Root

| File | Purpose |
|------|---------|
| `README.md` | Project overview, setup instructions, and architecture reference |
| `README.md` | Project readme with setup, API usage, and configuration |
| `docker-compose.yml` | Docker Compose — postgres, redis, api, worker, frontend services |
| `.env.example` | Template for environment variables |
| `.gitignore` | Git ignore rules |

---

## `backend/` — Python FastAPI Server

### Entry Points

| File | Purpose |
|------|---------|
| `app/main.py` | FastAPI app factory — router mounting, CORS, lifespan hooks (auto-creates admin user) |
| `app/config.py` | Pydantic Settings — `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, feature flags, ML model paths |
| `app/database.py` | SQLAlchemy engine + session factory with PostgreSQL connection pooling |
| `app/dependencies.py` | FastAPI dependency injection — `get_db()` session, `get_current_user()` JWT auth |

### `app/models/` — SQLAlchemy ORM

| File | Purpose |
|------|---------|
| `base.py` | Declarative base class for all models |
| `user.py` | `User` — username, hashed password, is_active flag |
| `source.py` | `DataSource` — named source with column_mapping JSON, delimiter, filename pattern |
| `batch.py` | `ImportBatch` — one CSV upload: filename, row count, status, Celery task ID |
| `staging.py` | `StagedSupplier` — supplier row from CSV with normalized fields + 384-dim `name_embedding` vector |
| `match.py` | `MatchGroup` + `MatchCandidate` — duplicate groups and pairwise comparison scores |
| `unified.py` | `UnifiedSupplier` — golden merged record with field-level `provenance` JSON |
| `ml_model.py` | `MLModelVersion` — trained LightGBM scorer/blocker artifacts, metrics, feature metadata |
| `audit.py` | `AuditLog` — tracks review actions (merge, reject, skip, promote) with timestamps |

### `app/routers/` — API Route Handlers (all `/api/` prefixed)

| File | Purpose |
|------|---------|
| `auth.py` | `POST /login`, `GET /me`, `POST /users` — JWT authentication |
| `users.py` | `GET /users` — list all users |
| `sources.py` | Data source CRUD + `POST /sources/detect-columns` for CSV auto-detection |
| `upload.py` | `POST /import/upload` — CSV upload, `GET /import/batches/{id}/status` — task polling |
| `matching.py` | `POST /matching/run`, `POST /matching/train-model`, `GET /matching/stats` |
| `review.py` | Review queue, match detail, `POST merge/reject` actions |
| `unified.py` | Browse unified suppliers, singleton list/promote, CSV export, dashboard analytics |
| `ws.py` | WebSocket `/ws` — real-time matching notifications via Redis pub/sub |

### `app/schemas/` — Pydantic Request/Response Models

| File | Purpose |
|------|---------|
| `auth.py` | `LoginRequest`, `TokenResponse`, `UserResponse`, `UserCreate` |
| `source.py` | `DataSourceCreate`, `DataSourceUpdate`, `DataSourceResponse`, column detection |
| `upload.py` | `UploadResponse`, `BatchStatusResponse` |
| `matching.py` | `MatchingRunRequest`, `MatchingStatsResponse`, ML retraining responses |
| `review.py` | `ReviewQueueResponse`, `MatchDetailResponse`, `FieldComparison`, merge payloads |
| `unified.py` | `UnifiedSupplierResponse`, `FieldProvenance`, dashboard aggregations |

### `app/services/` — Business Logic

| File | Purpose |
|------|---------|
| `auth.py` | Password hashing (PBKDF2), JWT creation/verification |
| `ingestion.py` | CSV parse, field mapping, dedup, normalization, embedding generation, storage |
| `normalization.py` | Text normalization — lowercase, strip whitespace, standardize company suffixes |
| `embedding.py` | Lazy-loaded sentence-transformers (all-MiniLM-L6-v2) for 384-dim name embeddings |
| `blocking.py` | Candidate pair generation — text token overlap + pgvector HNSW nearest-neighbor |
| `scoring.py` | Multi-signal confidence: jaro-winkler, token-jaccard, embedding-cosine, short-name, currency, contact |
| `ml_training.py` | LightGBM model training for scorer and blocker from review decisions |
| `ml_scoring.py` | Inference with trained scorer/blocker models |
| `matching.py` | Orchestrates blocking, scoring, clustering, database insertion |
| `clustering.py` | Union-Find transitive closure to group related pairs into MatchGroups |
| `grouping.py` | Intra-source dedup — collapses exact-name duplicates within each source |
| `merge.py` | Creates UnifiedSupplier with per-field provenance from confirmed matches |
| `retraining.py` | Optimizes signal weights from confirmed/rejected review decisions |
| `column_guesser.py` | CSV column classifier — heuristics on text length, company tokens, ISO patterns |
| `source.py` | DataSource CRUD, re-upload handling (supersedes old staged records) |
| `audit.py` | Writes AuditLog entries for review actions |
| `notifications.py` | Redis pub/sub bridge for WebSocket task completion events |

### `app/tasks/` — Celery Background Tasks

| File | Purpose |
|------|---------|
| `celery_app.py` | Celery config — Redis broker/backend |
| `ingestion.py` | `process_upload` — runs ingestion, auto-triggers matching |
| `matching.py` | `run_matching` — blocking + scoring + clustering, sends WebSocket notification |

### `app/utils/`

| File | Purpose |
|------|---------|
| `csv_parser.py` | CSV reader with BOM handling and encoding fallback (UTF-8-sig, Windows-1252) |

### `alembic/versions/` — Database Migrations (7 versions)

| Migration | Purpose |
|-----------|---------|
| `001_initial_schema` | Users, data_sources, import_batches, staged_suppliers + pgvector |
| `002_matching_engine` | Scoring signals and algorithm support for match_candidates |
| `003_unified_suppliers` | unified_suppliers table with provenance JSONB |
| `004_add_filename_pattern` | filename_pattern column on data_sources |
| `005_widen_staged_columns` | Widen staged_suppliers text columns |
| `006_add_intra_source_group_id` | intra_source_group_id for intra-source dedup |
| `007_add_ml_model_versions` | ml_model_versions table for LightGBM artifacts |

### `tests/` — Backend Test Suite (243 tests, SQLite by default)

| File | Purpose |
|------|---------|
| `conftest.py` | Fixtures — SQLite DB, test client, auth token, sample data factories |
| `test_auth.py` | Login, JWT validation, user creation, password hashing |
| `test_sources.py` | DataSource CRUD, column detection |
| `test_upload.py` | CSV upload, batch creation |
| `test_csv_parser.py` | CSV parsing edge cases (encodings, delimiters) |
| `test_column_guesser.py` | Column classification heuristics |
| `test_normalization.py` | Text normalization rules |
| `test_embedding.py` | Embedding generation, vector dimensions |
| `test_blocking.py` | Candidate pair generation |
| `test_scoring.py` | Multi-signal scoring accuracy |
| `test_ml_training.py` | LightGBM model training and features |
| `test_ml_scoring.py` | ML model inference |
| `test_clustering.py` | Transitive closure grouping |
| `test_grouping.py` | Intra-source dedup logic |
| `test_matching_service.py` | End-to-end matching pipeline |
| `test_matching_api.py` | Matching API endpoints |
| `test_ml_api.py` | ML retraining API endpoints |
| `test_review_merge.py` | Review actions and merge logic |
| `test_unified.py` | Unified supplier queries, export |
| `test_ingestion_task.py` | Celery ingestion task |
| `test_audit.py` | Audit log creation |
| `test_ws.py` | WebSocket notifications |
| `test_config.py` | Configuration loading |
| `test_reupload.py` | Re-upload candidate invalidation |

### Backend Config Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage Docker build |
| `entrypoint.sh` | Container startup — runs migrations, starts Gunicorn |
| `requirements.txt` | Production deps (FastAPI, SQLAlchemy, Celery, sentence-transformers, LightGBM) |
| `requirements-dev.txt` | Dev deps (pytest, coverage, ruff) |
| `pyproject.toml` | Ruff config (Python 3.12, line-length 120) |
| `pytest.ini` | Pytest config (70% coverage target) |
| `alembic.ini` | Alembic migration config |

---

## `frontend/` — React + TypeScript + Vite

### Build & Config

| File | Purpose |
|------|---------|
| `package.json` | React 19, TanStack Query 5, React Router v7, Tailwind CSS v4 |
| `vite.config.ts` | Vite 8 — React + Tailwind plugins, dev proxy `/api` and `/ws` to `:8000` |
| `tsconfig.json` | Root TS config (references app + node configs) |
| `tsconfig.app.json` | App TS — ES2023, strict, React-JSX |
| `tsconfig.node.json` | Node TS — for Vite config compilation |
| `eslint.config.js` | Flat config — TS-ESLint, React hooks, React refresh |
| `index.html` | Entry HTML — Manrope + Inter fonts, Material Symbols icons |
| `Dockerfile` | Multi-stage: Node 22 build, Nginx Alpine runtime |
| `nginx.conf` | API/WS proxy to backend, SPA fallback, 50M body limit |

### `src/api/` — API Client

| File | Purpose |
|------|---------|
| `client.ts` | Typed fetch wrapper — JWT from localStorage, auto-redirect on 401 |
| `types.ts` | TypeScript interfaces mirroring backend Pydantic schemas |

### `src/hooks/` — React Hooks

| File | Purpose |
|------|---------|
| `useAuth.tsx` | AuthProvider context — login/logout/me, token persistence |
| `useTheme.tsx` | Dark/light theme context with localStorage + system preference fallback |
| `useTaskStatus.ts` | Polls Celery task progress via React Query |
| `useMatchingNotifications.ts` | WebSocket hook — reconnection with exponential backoff, heartbeat dedup |

### `src/components/` — Shared UI

| File | Purpose |
|------|---------|
| `Layout.tsx` | App shell — glassmorphism sidebar + top navbar, toast container, WebSocket wiring |
| `Toast.tsx` | Glass-morphic slide-up toasts — success/error/info with auto-dismiss |
| `ErrorBoundary.tsx` | React error boundary with retry |
| `ProtectedRoute.tsx` | Auth guard — redirects to `/login` if unauthenticated |
| `DropZone.tsx` | Drag-and-drop file upload with visual feedback |
| `ColumnMapper.tsx` | Two-step column mapping wizard — name source, map CSV columns to canonical fields |
| `ProgressTracker.tsx` | 5-stage pipeline tracker (Parsing, Normalizing, Embedding, Enqueued, Matching) |
| `BatchHistory.tsx` | Upload history table per data source |
| `ReUploadDialog.tsx` | Confirmation modal for re-upload with supersede warning |

### `src/pages/` — Route Pages

| File | Purpose |
|------|---------|
| `Login.tsx` | Username/password form with JWT storage |
| `Dashboard.tsx` | Pipeline view — hero progress ring, stage cards, next actions |
| `Upload.tsx` | Upload-first flow — file drop, auto source detection, column mapping, batch tracking |
| `Sources.tsx` | Data source CRUD — card grid with column mapping editor |
| `ReviewQueue.tsx` | Filterable candidate queue — confidence badges, status filters |
| `ReviewDetail.tsx` | Match review — confidence ring, signal breakdown, side-by-side field comparison, merge/reject |
| `UnifiedSuppliers.tsx` | Tabbed view — unified records + singletons with bulk promote, CSV export |
| `UnifiedSupplierDetail.tsx` | Single unified supplier — provenance tags, source records, audit trail |
| `Users.tsx` | User list + create, deterministic avatar gradients |

---

## `docs/`

| Directory | Purpose |
|-----------|---------|
| `architecture/` | Long-lived project reference (this file) |
| `design/` | Feature design docs — problem statement, chosen solution, design rationale |
| `backlog/` | Known issues, incomplete features, planned work |
