# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is OneBase?

Enterprise supplier data unification platform. Ingests supplier CSVs from multiple sources, deduplicates via multi-signal matching (text similarity + embeddings), human-in-the-loop review, and produces golden unified supplier records with field-level provenance.

## Tech Stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy, PostgreSQL + pgvector, Celery + Redis
- **Frontend:** React 19, TypeScript, Vite 8 (Rolldown), TanStack Query, React Router v7, Tailwind CSS v4
- **ML:** sentence-transformers (all-MiniLM-L6-v2, 384-dim embeddings), rapidfuzz
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

### 2. Backend setup (from `backend/`)

```bash
# One-time: create a virtual environment (system Python is externally-managed)
python3 -m venv .venv
source .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt

# Run migrations and start dev server
ENV_PROFILE=dev alembic upgrade head
ENV_PROFILE=dev uvicorn app.main:app --reload    # dev server on :8000
```

In a second terminal (activate the venv first):

```bash
cd backend && source .venv/bin/activate
ENV_PROFILE=dev celery -A app.tasks.celery_app worker --loglevel=info --concurrency=2
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
python3 -m pytest                        # run all tests (202 tests, SQLite)
python3 -m pytest tests/test_auth.py     # run single test file
python3 -m pytest tests/test_auth.py::test_login_success -v  # single test
TEST_DATABASE_URL=postgresql://... python3 -m pytest  # test against Postgres
alembic revision --autogenerate -m "description"  # new migration

# Frontend (from frontend/)
npm run build     # tsc -b && vite build
npm run lint      # ESLint
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
3. **Scoring** (`services/scoring.py`): Multi-signal confidence (jaro-winkler 0.30, token-jaccard 0.20, embedding-cosine 0.25, short-name 0.10, currency 0.05, contact 0.10)
4. **Clustering** (`services/clustering.py`): Transitive closure to group related pairs into MatchGroups
5. **Review** (UI + `routers/review.py`): Human confirms/rejects/skips candidates
6. **Merge** (`services/merge.py`): Creates UnifiedSupplier with per-field provenance JSON tracking source, reviewer, timestamp

Steps 1-4 run as Celery tasks (Redis broker). Frontend polls `/api/import/batches/{task_id}/status` + WebSocket for completion.

### Backend Structure

- `app/models/` - SQLAlchemy ORM: User, DataSource, ImportBatch, StagedSupplier, MatchGroup, MatchCandidate, UnifiedSupplier, AuditLog
- `app/routers/` - FastAPI route handlers, all prefixed `/api/` (auth, sources, upload, matching, review, unified, users, ws)
- `app/services/` - Business logic, one service per domain concern
- `app/services/column_guesser.py` - Auto-detects CSV column mappings for ingestion
- `app/services/notifications.py` - WebSocket event broadcasting for async task updates
- `app/schemas/` - Pydantic request/response models
- `app/tasks/` - Celery tasks: `process_upload` (ingestion + triggers matching), `run_matching` (blocking + scoring + clustering)
- `app/dependencies.py` - `get_db()` session, `get_current_user()` JWT auth (OAuth2 Bearer, HS256)

### Frontend Structure

- `src/api/client.ts` - Typed fetch wrapper with JWT from localStorage (`onebase_token`), auto-redirect on 401
- `src/api/types.ts` - TypeScript interfaces mirroring backend schemas
- `src/hooks/useAuth.tsx` - AuthContext provider (login/logout/me)
- `src/hooks/useTaskStatus.ts` - Poll Celery task progress
- `src/hooks/useMatchingNotifications.ts` - WebSocket for async matching events
- `src/pages/` - Route components: Dashboard, Upload, Sources, ReviewQueue, ReviewDetail, UnifiedSuppliers, UnifiedSupplierDetail, Users, Login

### Key Dependencies
- `vite` 8.x uses Rolldown (Rust bundler) — no esbuild/rollupOptions in config
- `@vitejs/plugin-react` 6.x required for Vite 8 (v4 only supports up to Vite 7)
- `@tailwindcss/vite` needs >=4.2.2 for Vite 8 peer dep

### Key Design Decisions

- **Field-level provenance**: UnifiedSupplier.provenance is a JSON dict mapping each field to its source record, reviewer, and timestamp
- **Re-upload handling**: Re-uploading for a source marks old StagedSuppliers as "superseded" and invalidates their MatchCandidates
- **Signal weight retraining**: `POST /api/matching/retrain` optimizes signal weights from confirmed/rejected decisions (requires 20+ reviews)
- **Test DB**: Tests use SQLite by default (fast, no deps) with WAL mode; set `TEST_DATABASE_URL` for Postgres integration tests

## Environment Variables

Configured via `.env` (see `.env.example`): `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `POSTGRES_PASSWORD`

Matching engine tuning (optional): `MATCHING_CONFIDENCE_THRESHOLD` (default 0.45), `MATCHING_BLOCKING_K` (default 20), `MATCHING_MAX_CLUSTER_SIZE` (default 50)

## Database

PostgreSQL 16 with pgvector extension. 5 Alembic migrations in `backend/alembic/versions/`. Key table: `staged_suppliers` has HNSW index on `name_embedding` (384-dim vector) for fast nearest-neighbor blocking.

## Rules

- Always use Context7 MCP to fetch up-to-date library/API documentation, code examples, setup, and configuration steps — without being explicitly asked. Prefer Context7 over training-data knowledge for any library-specific question.
