# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is OneBase?

Enterprise supplier data unification platform. Ingests supplier CSVs from multiple sources, deduplicates via multi-signal matching (text similarity + embeddings), human-in-the-loop review, and produces golden unified supplier records with field-level provenance.

## Tech Stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy, PostgreSQL + pgvector, Celery + Redis
- **Frontend:** React 19, TypeScript, Vite 8 (Rolldown), TanStack Query, React Router v7, Tailwind CSS v4
- **ML:** sentence-transformers (all-MiniLM-L6-v2, 384-dim embeddings), LightGBM, rapidfuzz
- **Infra:** Docker Compose (postgres, redis, api, worker, frontend/nginx)

## Environment Profiles

The app uses `.env` files with an optional `ENV_PROFILE` variable to switch between dev and prod settings.

| File | Purpose | Hostnames |
|------|---------|-----------|
| `.env` | Base config (shared defaults) | Docker service names (`postgres`, `redis`) |
| `.env.dev` | Local native dev | `localhost` (Docker ports exposed to host) |
| `.env.prod` | Production | Real hosts, strong secrets, `ENVIRONMENT=production` |

**How it works:** `config.py` loads `.env` first, then overlays `.env.{ENV_PROFILE}` on top. Env vars set in the shell always win.

```bash
ENV_PROFILE=dev uvicorn app.main:app --reload   # loads .env then .env.dev
ENV_PROFILE=prod celery -A ...                  # loads .env then .env.prod
```

Without `ENV_PROFILE`, only `.env` is loaded (Docker Compose default).

> **Security:** `.env.*` files are gitignored. `.env.prod` ships with placeholders — fill in real secrets before deploying.

## Local Development Setup

### Prerequisites

- Python 3.12, Node.js, Docker (for Postgres + Redis)

### 1. Start databases only (lightest path)

```bash
docker-compose up -d postgres redis      # just the DBs, no app containers
```

### 2. Backend setup

```bash
# One-time: create venv at project root (system Python is externally-managed)
python3 -m venv .venv             # creates <repo-root>/.venv
source .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r backend/requirements-dev.txt   # includes prod deps + test/lint tools

# Run migrations and start dev server (from backend/)
cd backend
ENV_PROFILE=dev alembic upgrade head
ENV_PROFILE=dev uvicorn app.main:app --reload    # dev server on :8000
```

In a second terminal (activate the venv first):

```bash
source .venv/bin/activate
cd backend
ENV_PROFILE=dev celery -A app.tasks.celery_app worker --loglevel=info --concurrency=2
```

#### Alternative: using uv (recommended for reproducible installs)

```bash
# One-time: install uv (https://docs.astral.sh/uv/getting-started/installation/)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install from lock file (exact reproducible install)
cd backend
uv sync

# Add a new dependency
uv add <package>

# Update lock file after editing pyproject.toml
uv lock
```

### 3. Frontend setup (from `frontend/`)

```bash
npm install       # one-time
npm run dev       # Vite dev server on :5173 (proxies /api to :8000, /ws to ws://:8000)
```

Open `http://localhost:5173` — login with `admin` / `changeme`.

> **Note:** The Celery worker is only needed for uploads and matching. The UI will load without it.

### Commands

```bash
# Backend (from backend/, with venv activated)
python3 -m pytest                        # run all tests (~334 tests, SQLite)
python3 -m pytest tests/test_auth.py     # run single test file
python3 -m pytest tests/test_auth.py::test_login_success -v  # single test
TEST_DATABASE_URL=postgresql://... python3 -m pytest  # test against Postgres
ruff check . --fix                       # lint (auto-fix)
ruff format .                            # format
alembic revision --autogenerate -m "description"  # new migration

# Frontend (from frontend/)
npm run build     # tsc -b && vite build
npm run lint      # ESLint
npm run test      # vitest (run once)
npm run test:watch   # vitest in watch mode
npm run test:coverage  # vitest with coverage
```

### Docker (full stack — alternative to above)

```bash
docker-compose up -d                # start all services (heavier, no venv needed)
docker-compose logs -f api worker   # tail logs
docker-compose down                 # stop
```

Docker Compose uses the root `.env` (Docker hostnames) by default — no `ENV_PROFILE` needed.

Default login: admin / changeme (set via ADMIN_USERNAME/ADMIN_PASSWORD in .env)

## Architecture

### Data Pipeline

```
CSV Upload → Ingestion → Blocking → Scoring → Clustering → Human Review → Merge
             (Celery)    ──────────(Celery)──────────────    (UI/API)    (API)
```

1. **Ingestion** (`services/ingestion.py`): Parse CSV via column mapping from DataSource config, normalize fields, insert StagedSupplier rows
2. **Blocking** (`services/blocking.py`): Generate candidate pairs via text token overlap + pgvector HNSW nearest-neighbor
3. **Scoring** (`services/scoring.py`): Multi-signal confidence with default weights (jaro-winkler 0.30, token-jaccard 0.20, embedding-cosine 0.25, short-name 0.10, currency 0.05, contact 0.10) — all tunable via `MATCHING_WEIGHT_*` env vars
4. **Clustering** (`services/clustering.py`): Transitive closure to group related pairs into MatchGroups
5. **Review** (UI + `routers/review.py`): Human confirms/rejects/skips candidates
6. **Merge** (`services/merge.py`): Creates UnifiedSupplier with per-field provenance JSON tracking source, reviewer, timestamp

Steps 1-4 run as Celery tasks (Redis broker). Frontend polls `/api/import/batches/{task_id}/status` + WebSocket for completion.

### Backend Structure

- `app/models/` - SQLAlchemy ORM: User, DataSource, ImportBatch, StagedSupplier, MatchGroup, MatchCandidate, UnifiedSupplier, MLModelVersion, AuditLog
- `app/routers/` - FastAPI route handlers, all prefixed `/api/` (auth, sources, upload, matching, review, unified, users) except `ws` (no prefix)
- `app/services/` - Business logic, one service per domain concern (including `audit.py`, `auth.py`, `column_guesser.py`, `embedding.py`, `grouping.py`, `matching.py`, `ml_training.py`, `ml_scoring.py`, `normalization.py`, `notifications.py`, `retraining.py`, `source.py`)
- `app/schemas/` - Pydantic request/response models (auth, source, upload, matching, review, unified)
- `app/tasks/` - Celery tasks: `process_upload` (ingestion + triggers matching), `run_matching` (blocking + scoring + clustering)
- `app/dependencies.py` - `get_db()` session, `get_current_user()` JWT auth (OAuth2 Bearer, HS256)
- `app/database.py` - SQLAlchemy engine and `SessionLocal` factory
- `app/utils/csv_parser.py` - Low-level CSV reading utility (used by ingestion)

### Frontend Structure

- `src/api/client.ts` - Typed fetch wrapper with JWT from localStorage (`onebase_token`), auto-redirect on 401
- `src/api/types.ts` - TypeScript interfaces mirroring backend schemas
- `src/hooks/useAuth.tsx` - AuthContext provider (login/logout/me)
- `src/hooks/useTaskStatus.ts` - Poll Celery task progress
- `src/hooks/useMatchingNotifications.ts` - WebSocket for async matching events
- `src/hooks/useNotifications.ts` - Toast notification state management
- `src/hooks/useTheme.tsx` - Dark/light theme context and toggle
- `src/components/` - Reusable UI: Layout, ErrorBoundary, ProtectedRoute, DropZone, ColumnMapper, ProgressTracker, Toast, BatchHistory, ReUploadDialog, NotificationCenter, Pagination
- `src/pages/` - Route components: Dashboard, Upload, Sources, ReviewQueue, ReviewDetail, UnifiedSuppliers, UnifiedSupplierDetail, Users, Login

### Key Dependencies
- `vite` 8.x uses Rolldown (Rust bundler) — no esbuild/rollupOptions in config
- `@vitejs/plugin-react` 6.x required for Vite 8 (v4 only supports up to Vite 7)
- `@tailwindcss/vite` resolves to >=4.2.2 at install time (required for Vite 8 peer dep — `^4.0.0` in package.json resolves to a compatible version)

### Key Design Decisions

- **Field-level provenance**: UnifiedSupplier.provenance is a JSON dict mapping each field to its source record, reviewer, and timestamp
- **Re-upload handling**: Re-uploading for a source marks old StagedSuppliers as "superseded" and invalidates their MatchCandidates
- **ML-enhanced matching**: `POST /api/matching/train-model` trains a LightGBM scorer/blocker from review decisions; falls back to weighted-sum when no model exists
- **Signal weight retraining**: `POST /api/matching/retrain` optimizes linear signal weights from confirmed/rejected decisions (requires 20+ reviews)
- **Test DB**: Tests use SQLite by default (fast, no deps) with WAL mode; set `TEST_DATABASE_URL` for Postgres integration tests
- **Production secret validation**: `validate_production_secrets()` runs at startup — if `ENVIRONMENT=production` and `JWT_SECRET` is still the default, the app refuses to start with a RuntimeError
- **Health endpoint**: `GET /health` (no `/api/` prefix, unlike all other routes) — returns `{"status": "ok"}`, useful for load balancer/container health checks

## Environment Variables

Configured via `.env` (see `.env.example`): `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `POSTGRES_PASSWORD`

Matching engine tuning (optional): `MATCHING_CONFIDENCE_THRESHOLD` (default 0.45), `MATCHING_BLOCKING_K` (default 20), `MATCHING_MAX_CLUSTER_SIZE` (default 50), `MATCHING_MAX_BUCKET_PAIRS` (default 500)

Matching signal weights (optional): `MATCHING_WEIGHT_JARO_WINKLER` (0.30), `MATCHING_WEIGHT_TOKEN_JACCARD` (0.20), `MATCHING_WEIGHT_EMBEDDING_COSINE` (0.25), `MATCHING_WEIGHT_SHORT_NAME` (0.10), `MATCHING_WEIGHT_CURRENCY` (0.05), `MATCHING_WEIGHT_CONTACT` (0.10)

JWT config: `JWT_EXPIRE_MINUTES` (default 480, 8 hours)

## Database

PostgreSQL 16 with pgvector extension. 8 Alembic migrations in `backend/alembic/versions/`. Key table: `staged_suppliers` has HNSW index on `name_embedding` (384-dim vector) for fast nearest-neighbor blocking.

## Code Style

- **Backend**: Ruff (line-length 120, double quotes, target Python 3.12). Lint rules: E, F, W, I, UP, B, SIM, S. Config in `backend/pyproject.toml`.
- **Frontend**: ESLint via `eslint.config.js`. Tests use Vitest + React Testing Library.
- **Pre-commit hooks**: ruff lint+format, trailing-whitespace, end-of-file-fixer, check-yaml, check-added-large-files. Config in `.pre-commit-config.yaml`.

## Rules

- Always use Context7 MCP to fetch up-to-date library/API documentation, code examples, setup, and configuration steps — without being explicitly asked. Prefer Context7 over training-data knowledge for any library-specific question.
