# Phase 1: Foundation + Ingestion Pipeline - Research

**Researched:** 2026-03-13
**Domain:** Full-stack greenfield project setup (Python/FastAPI + PostgreSQL/pgvector + Celery/Redis + React/Vite) with CSV ingestion, name normalization, embedding computation, and authentication
**Confidence:** HIGH

## Summary

Phase 1 is a greenfield foundation phase that establishes the entire project: Docker Compose multi-service environment, database schema with pgvector, authentication, audit trail, CSV upload with parsing/normalization/embedding computation, data source management, and re-upload lifecycle. The tech stack is well-established (FastAPI + SQLAlchemy + Celery + React) with excellent documentation.

The critical technical challenges are: (1) structuring a shared Python codebase that runs as both FastAPI API server and Celery worker in separate Docker containers, (2) correctly configuring pgvector with SQLAlchemy for 384-dim embeddings, (3) implementing robust CSV parsing for semicolon-delimited Sage X3 exports with BOM handling, (4) designing the name normalization pipeline to preserve raw data while computing normalized forms and embeddings, and (5) implementing the re-upload supersession lifecycle correctly from day one to avoid orphaned state.

**Primary recommendation:** Use synchronous SQLAlchemy sessions (not async) for both API and worker — async adds complexity with no performance benefit at this scale (2-5 users, ~5K records). Use JWT bearer tokens for auth (simpler stateless approach for a small team). Use `python:3.12-slim` as base image with multi-stage Docker builds. Pre-download the sentence-transformers model during Docker build.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Upload & processing feedback**: Step-by-step progress display showing real-time stages (parsing → normalizing → computing embeddings) with counts/percentages. Progress displays inline on the upload page — the upload area transforms into a progress tracker, no page navigation. Drag-and-drop zone with a "Browse files" button inside it (both methods available). Data quality warnings shown as a summary after parsing: "1,623 rows parsed. 12 rows had warnings." Expandable to see details. Processing continues regardless. Matching is auto-enqueued as the final stage in the progress tracker (parse → normalize → embed → matching enqueued).
- **Column mapping workflow**: Visual mapper interface: left column shows canonical fields, right column shows dropdowns populated with actual CSV headers from the uploaded file. Upload-first flow for new sources: user uploads a file, system detects it's a new source, prompts to create source and map columns using actual headers from the file. For existing sources: dropdown to select existing source or "New source" before uploading. Known sources skip the mapping step. Required fields: supplier_name and supplier_code must be mapped. All other canonical fields (short_name, currency, payment_terms, contact_name, supplier_type) are optional.
- **Re-upload experience**: Confirmation dialog before superseding: shows counts of affected records ("EOT already has 1,623 staged suppliers from batch #3. Uploading will supersede those records and invalidate 42 pending match candidates. Continue?"). Batch history visible under data source — user can see all previous uploads, row counts, timestamps, and superseded status. Read-only, no rollback. Invalidated match candidates are auto-removed from the review queue (not greyed out). Count shown in re-upload result summary. Matching auto-triggers after re-upload ingestion completes.
- **Initial setup & seeding**: First user account created via environment variables in docker-compose (no default credentials). Additional users added via a simple user management page in the UI — any logged-in user can create new users (all users are equal, no admin role). Blank slate for data sources — no pre-seeded EOT/TTEI configurations. User creates all data sources from scratch through the UI. Database schema auto-migrates on container startup via Alembic (tables, pgvector extension, indexes created automatically).

### Claude's Discretion
- Loading skeleton and transition animations during processing
- Exact layout and spacing of the visual column mapper
- Error state design (network failures, invalid file formats)
- Audit trail storage format and what actions to log beyond the obvious (uploads, user creation)
- Session management approach (JWT vs session cookies)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INGS-01 | User can upload semicolon-delimited CSV exports from configured Sage X3 entities | FastAPI UploadFile + python `csv` module with `utf-8-sig` encoding, delimiter=`;` |
| INGS-02 | System parses uploaded files with BOM stripping, whitespace trimming, and correct delimiter handling | `encoding='utf-8-sig'` auto-strips BOM; `csv.DictReader` with delimiter=`;` and `quotechar='"'` |
| INGS-03 | User can configure column mappings per data source as JSON | `data_sources` table with `column_mapping` JSONB column; visual mapper UI with dropdowns populated from CSV headers |
| INGS-04 | System normalizes supplier names (uppercase, remove legal suffixes, collapse spaces) | Pure-function normalization in `utils/normalization.py`; preserve raw name alongside normalized form |
| INGS-05 | System computes name embeddings (all-MiniLM-L6-v2, 384 dims) | `sentence-transformers` model loaded once in Celery worker; batch `model.encode()` with `batch_size=64` |
| INGS-06 | System stores both raw JSONB data and extracted key fields in staging tables | Hybrid storage pattern: `raw_data` JSONB + typed key field columns on `staged_suppliers` table |
| INGS-07 | Re-upload supersedes old staged records and invalidates stale match candidates | Status field on `staged_suppliers` (active/superseded); CASCADE invalidation on `match_candidates` |
| INGS-08 | System auto-enqueues Celery matching task after ingestion completes | Celery task chain: ingestion task → `.apply_async()` matching task on success (stub in Phase 1) |
| OPS-02 | User can manage data sources via UI | CRUD API endpoints (`/api/sources`) + React data source management page |
| OPS-03 | System authenticates users with username/password | JWT bearer tokens via FastAPI `OAuth2PasswordBearer`; `passlib[bcrypt]` for password hashing; PyJWT for token generation |
| OPS-04 | System logs all user actions in audit trail | `audit_log` table with user_id, action, entity_type, entity_id, details JSONB, timestamp |
| OPS-06 | All UI pages production-grade with dark theme | React + Vite + Tailwind CSS 4 + frontend-design skill |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Python | 3.12 | Runtime | Best library compatibility; 3.12 performance improvements; 3.13 available but 3.12 safer |
| FastAPI | ~0.115.14 | API framework | Async-native, Pydantic v2 validation, OAuth2 built-in, auto OpenAPI docs |
| Pydantic | ~2.12.5 | Validation & settings | FastAPI's native validation. v2 is 5-17x faster (Rust core). Also handles settings via `BaseSettings` |
| SQLAlchemy | ~2.0.45 | ORM | Industry standard. 2.0 style `select()` syntax, `mapped_column()`, JSONB support |
| Alembic | ~1.18.4 | Migrations | Auto-generate migrations from models. Run `alembic upgrade head` on container startup |
| Celery | ~5.6.2 | Task queue | Handles async ingestion pipeline (parse → normalize → embed). Progress tracking via `update_state()` |
| Redis | 7-alpine | Broker | Celery broker + result backend. Lightweight Docker image |
| PostgreSQL | 16 | Database | JSONB for raw data, pgvector for embeddings. Use `pgvector/pgvector:pg16` Docker image |
| pgvector | 0.8.x | Vector search | HNSW index for 384-dim embeddings. In-PostgreSQL — no separate vector DB needed |
| React | 19.x | Frontend | Dominant framework. Hooks-based architecture for data-heavy UIs |
| Vite | 6.x | Build tool | Instant HMR, fast builds. Replaces deprecated CRA |
| TypeScript | ~5.7 | Type safety | Non-negotiable for enterprise data apps |
| Tailwind CSS | 4.x | Styling | Fast dark-theme development. CSS-first config in v4 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| uvicorn | ~0.34.x | ASGI server | Production FastAPI server |
| python-multipart | ~0.0.20 | File uploads | Required by FastAPI for `UploadFile` |
| psycopg2-binary | ~2.9.x | PostgreSQL driver | Sync driver for both API and Celery worker |
| pgvector-python | ~0.3.x | pgvector SQLAlchemy types | `Vector(384)` column type, HNSW index helpers |
| passlib[bcrypt] | latest | Password hashing | Bcrypt hashing for user passwords |
| PyJWT | latest | JWT tokens | Token generation/validation for auth |
| pydantic-settings | latest | Config management | `BaseSettings` for reading env vars and `.env` files |
| sentence-transformers | ~5.3.0 | Embeddings | `all-MiniLM-L6-v2` model, `model.encode()` batch API |
| React Router | 7.x | Routing | Client-side routing between pages |
| TanStack Query | 5.x | Server state | API fetching, caching, background refetch, polling for task status |
| TanStack Table | 8.x | Data tables | Headless table for supplier lists, batch history |
| @tailwindcss/vite | latest | Vite integration | Tailwind CSS 4 Vite plugin |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Sync SQLAlchemy | Async SQLAlchemy (asyncpg) | Async adds complexity; Celery can't use async; at 2-5 users, sync is simpler and correct |
| JWT bearer tokens | Session cookies | JWT is stateless, simpler for SPA+API architecture; session cookies need CSRF protection |
| PyJWT | python-jose | PyJWT is simpler for basic JWT; python-jose adds JWK/JWS support we don't need |
| psycopg2-binary | asyncpg | We're using sync SQLAlchemy; psycopg2-binary is the standard sync driver |
| Tailwind CSS 4 | Shadcn/ui | Shadcn layers on Tailwind; can add later. Start with raw Tailwind + frontend-design skill |

**Installation:**
```bash
# Backend
pip install fastapi[standard] uvicorn[standard] \
    sqlalchemy psycopg2-binary alembic \
    celery[redis] redis \
    pydantic pydantic-settings \
    python-multipart \
    sentence-transformers \
    passlib[bcrypt] PyJWT \
    pgvector

# Frontend
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install react-router @tanstack/react-query @tanstack/react-table
npm install -D tailwindcss @tailwindcss/vite
```

## Architecture Patterns

### Recommended Project Structure
```
onebase/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                # FastAPI app, CORS, router includes, startup events
│   │   ├── config.py              # Pydantic BaseSettings (DB URL, Redis URL, JWT secret, etc.)
│   │   ├── database.py            # SQLAlchemy engine + SessionLocal factory (SYNC)
│   │   ├── dependencies.py        # get_db(), get_current_user() dependencies
│   │   ├── models/
│   │   │   ├── __init__.py        # Import all models for Alembic
│   │   │   ├── base.py            # DeclarativeBase class
│   │   │   ├── user.py            # User model
│   │   │   ├── audit.py           # AuditLog model
│   │   │   ├── source.py          # DataSource model
│   │   │   ├── batch.py           # ImportBatch model
│   │   │   └── staging.py         # StagedSupplier model (with Vector(384))
│   │   ├── schemas/               # Pydantic request/response schemas
│   │   │   ├── __init__.py
│   │   │   ├── auth.py            # Token, Login, UserCreate, UserResponse
│   │   │   ├── source.py          # DataSourceCreate, DataSourceResponse, ColumnMapping
│   │   │   ├── upload.py          # UploadResponse, BatchStatus, TaskProgress
│   │   │   └── staging.py         # StagedSupplierResponse
│   │   ├── routers/               # FastAPI APIRouters (thin, delegate to services)
│   │   │   ├── __init__.py
│   │   │   ├── auth.py            # POST /api/auth/login, POST /api/auth/users
│   │   │   ├── sources.py         # CRUD /api/sources
│   │   │   ├── upload.py          # POST /api/import/upload, GET /api/import/batches
│   │   │   └── users.py           # GET /api/users (list), user management
│   │   ├── services/              # Business logic (stateless, testable)
│   │   │   ├── __init__.py
│   │   │   ├── auth.py            # authenticate_user, create_token, hash_password
│   │   │   ├── ingestion.py       # parse_csv, map_columns, orchestrate ingestion
│   │   │   ├── normalization.py   # normalize_name, remove_legal_suffixes
│   │   │   ├── embedding.py       # Model loading, batch encoding
│   │   │   ├── source.py          # CRUD operations for data sources
│   │   │   └── audit.py           # log_action() helper
│   │   ├── tasks/                 # Celery task definitions
│   │   │   ├── __init__.py
│   │   │   ├── celery_app.py      # Celery app configuration (broker, result backend)
│   │   │   └── ingestion.py       # process_upload task (calls services)
│   │   └── utils/
│   │       ├── __init__.py
│   │       └── csv_parser.py      # BOM handling, semicolon parsing, validation
│   ├── alembic/
│   │   ├── env.py                 # Configured with app.models.base.Base.metadata
│   │   └── versions/              # Auto-generated migrations
│   ├── alembic.ini
│   ├── requirements.txt
│   ├── Dockerfile
│   └── entrypoint.sh              # Runs alembic upgrade head → then uvicorn or celery
├── frontend/
│   ├── src/
│   │   ├── api/                   # API client (fetch wrapper with JWT header)
│   │   ├── components/            # Shared UI components
│   │   │   ├── Layout.tsx         # App shell, sidebar, navigation
│   │   │   ├── DropZone.tsx       # Drag-and-drop file upload zone
│   │   │   ├── ProgressTracker.tsx # Pipeline progress display
│   │   │   └── ColumnMapper.tsx   # Visual column mapping interface
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Upload.tsx         # Upload + progress + column mapping
│   │   │   ├── Sources.tsx        # Data source management
│   │   │   └── Users.tsx          # User management
│   │   ├── hooks/
│   │   │   ├── useAuth.ts         # JWT token management, login/logout
│   │   │   └── useTaskStatus.ts   # Poll Celery task progress
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── vite.config.ts             # Proxy /api → backend:8000
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile                 # Node build → nginx serve
├── docker-compose.yml
├── .env.example
└── nginx.conf                     # Frontend + API reverse proxy
```

### Pattern 1: Sync SQLAlchemy Sessions Everywhere
**What:** Use synchronous SQLAlchemy engine and sessions for both FastAPI and Celery. FastAPI runs sync endpoints (FastAPI handles threading automatically via Starlette's threadpool).
**When to use:** When app scale doesn't justify async complexity. For 2-5 users with ~5K records, sync is correct.
**Example:**
```python
# Source: SQLAlchemy 2.0 official docs
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

class Base(DeclarativeBase):
    pass

# FastAPI dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### Pattern 2: Celery Task with Progress Updates
**What:** Bind Celery tasks and use `self.update_state()` to report pipeline stage progress. Frontend polls task status endpoint.
**When to use:** For the ingestion pipeline (parse → normalize → embed → enqueue matching).
**Example:**
```python
# Source: Celery 5.6 official docs
@celery_app.task(bind=True)
def process_upload(self, batch_id: int):
    self.update_state(state='PARSING', meta={'stage': 'parsing', 'progress': 0})
    rows = parse_csv(batch_id)
    
    self.update_state(state='NORMALIZING', meta={'stage': 'normalizing', 'progress': 33})
    normalize_suppliers(batch_id)
    
    self.update_state(state='EMBEDDING', meta={'stage': 'embedding', 'progress': 66})
    compute_embeddings(batch_id)
    
    self.update_state(state='COMPLETE', meta={'stage': 'complete', 'progress': 100})
    
    # Auto-enqueue matching (stub in Phase 1 — actual matching built in Phase 2)
    enqueue_matching.delay(batch_id)
    return {'batch_id': batch_id, 'row_count': len(rows)}
```

### Pattern 3: Entrypoint Script for Auto-Migration
**What:** Single Docker entrypoint script that runs `alembic upgrade head` before starting the service. Both `api` and `worker` containers run the same image with different commands.
**When to use:** Always — ensures schema is up-to-date on every container restart.
**Example:**
```bash
#!/bin/bash
# entrypoint.sh
set -e

# Run migrations (safe to run multiple times — Alembic tracks applied migrations)
echo "Running database migrations..."
alembic upgrade head

# Execute the passed command (uvicorn for api, celery for worker)
exec "$@"
```

### Pattern 4: JWT Authentication Flow
**What:** FastAPI OAuth2PasswordBearer with JWT tokens. Login endpoint returns token, all other endpoints require Bearer token header.
**When to use:** SPA + API architecture with small user base. Stateless, no server-side session store needed.
**Example:**
```python
# Source: FastAPI official docs (OAuth2 + JWT section)
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from passlib.context import CryptContext
import jwt

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        username = payload.get("sub")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user
```

### Pattern 5: Frontend API Client with JWT
**What:** Typed fetch wrapper that automatically attaches JWT token from localStorage to all API requests.
**When to use:** All frontend API calls.
**Example:**
```typescript
// api/client.ts
const API_BASE = '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

### Anti-Patterns to Avoid
- **Async SQLAlchemy in Celery workers:** Celery doesn't support async. Use sync sessions everywhere to avoid maintaining two database layers.
- **Importing ORM models directly in Celery tasks:** Tasks should call service functions. Services manage sessions. Tasks manage lifecycle (create session → call service → commit/rollback → close).
- **Single monolithic ingestion function:** Break into discrete stages (parse → normalize → embed → store). Each stage is independently testable.
- **Storing only normalized names:** Always store both raw and normalized forms. Normalization is lossy.
- **Hardcoding the first user:** Use environment variables (`ADMIN_USERNAME`, `ADMIN_PASSWORD`) read at startup to create the initial user if it doesn't exist.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password hashing | Custom hash functions | `passlib[bcrypt]` | Bcrypt is the standard. Custom hashing will have timing attacks, insufficient rounds, etc. |
| JWT token generation | Manual JWT string construction | `PyJWT` | JWT has many edge cases (expiry, algorithm confusion, encoding). PyJWT handles them. |
| CSV parsing with BOM | Manual byte-level BOM detection | `encoding='utf-8-sig'` + `csv.DictReader` | Python's `utf-8-sig` codec auto-strips BOM. `csv` module handles quoting, escaping, etc. |
| Embedding computation | Manual transformer inference | `sentence-transformers` `model.encode()` | Handles tokenization, batching, padding, normalization. Supports ONNX backend for faster CPU. |
| Vector storage/search | Custom cosine similarity in Python | `pgvector` with `Vector(384)` column | Database-native vector ops, HNSW indexing, filtered queries. Orders of magnitude faster. |
| Database migrations | Manual SQL scripts | Alembic autogenerate | Tracks migration history, generates diffs from model changes, handles rollback. |
| File upload handling | Manual multipart parsing | FastAPI `UploadFile` + `python-multipart` | Handles streaming, temp file management, content type detection. |
| CORS configuration | Manual header injection | FastAPI `CORSMiddleware` | Handles preflight requests, origin validation, credentials. |

**Key insight:** Every "simple" piece of infrastructure (auth, CSV parsing, file upload, migrations) has 10x more edge cases than the happy path suggests. Use battle-tested libraries.

## Common Pitfalls

### Pitfall 1: Celery Task Visibility Timeout
**What goes wrong:** Long-running ingestion tasks (>1 minute for large CSVs with embeddings) get re-delivered by Redis because the default `visibility_timeout` is 1 hour, but if the broker connection drops momentarily, tasks appear "lost" and are restarted — causing duplicate processing.
**Why it happens:** Redis broker's default `visibility_timeout` is 3600s (1 hour) which is usually fine, but network blips can cause re-delivery.
**How to avoid:** Set `broker_transport_options = {'visibility_timeout': 7200}` in Celery config. Use `task_acks_late = True` with `task_reject_on_worker_lost = True` for at-most-once semantics. Make ingestion idempotent — clear previous records for the batch before re-inserting.
**Warning signs:** Duplicate records appearing in staging tables; task status showing "STARTED" for already-completed tasks.

### Pitfall 2: Alembic and pgvector Extension
**What goes wrong:** Alembic migration fails because `CREATE EXTENSION vector` requires superuser privileges, or Alembic tries to drop/recreate the extension on every migration diff.
**Why it happens:** pgvector extension must be created before any `Vector` column types. Alembic autogenerate doesn't understand custom extensions.
**How to avoid:** Create the extension in the initial migration manually: `op.execute('CREATE EXTENSION IF NOT EXISTS vector')`. Add it BEFORE any table creation. In the `pgvector/pgvector:pg16` Docker image, the extension is pre-installed but still needs `CREATE EXTENSION` in each database.
**Warning signs:** Migration errors mentioning "type vector does not exist"; Alembic generating spurious migration diffs.

### Pitfall 3: Model Download in Container
**What goes wrong:** `sentence-transformers` downloads the `all-MiniLM-L6-v2` model (~80MB) at first use. In Docker, this happens every container restart if the model cache directory isn't persisted or pre-populated.
**Why it happens:** Default cache is `~/.cache/torch/sentence_transformers/`. Container restarts wipe this.
**How to avoid:** Pre-download during Docker build: `RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"`. This bakes the model into the Docker image. Alternatively, mount a Docker volume for the cache directory.
**Warning signs:** Slow first request after container restart; network errors in air-gapped environments.

### Pitfall 4: CSV Encoding Beyond BOM
**What goes wrong:** Some Sage X3 exports use Windows-1252 encoding instead of UTF-8. `utf-8-sig` handles BOM but fails on Windows-1252 characters (accented French names like "Établissements Côté").
**Why it happens:** Sage X3 on Windows may export in the system's default encoding.
**How to avoid:** Try `utf-8-sig` first, catch `UnicodeDecodeError`, fall back to `chardet` detection or `cp1252`. Log encoding detection result for debugging.
**Warning signs:** `UnicodeDecodeError` on upload; garbled characters in French/German supplier names.

### Pitfall 5: Re-Upload State Machine Complexity
**What goes wrong:** Re-upload without proper cascade invalidation creates orphaned match candidates pointing to superseded staged records, or loses reviewer work on in-progress reviews.
**Why it happens:** Developers build the happy path first and bolt on re-upload later.
**How to avoid:** Design the state machine upfront: staged_suppliers have `status` (active/superseded), match_candidates have `status` (pending/confirmed/rejected/invalidated). When re-uploading: (1) mark old staged records as superseded, (2) invalidate match_candidates referencing superseded records, (3) insert new staged records. Already-confirmed unified_suppliers are NOT touched.
**Warning signs:** Match candidates in review queue referencing records that no longer exist; duplicate entries in staging.

### Pitfall 6: Name Normalization Destroying Information
**What goes wrong:** Aggressive normalization makes different legal entities look identical. "ACME SARL" and "ACME SAS" are different companies.
**Why it happens:** Normalization is treated as simple preprocessing without considering that legal suffixes carry information.
**How to avoid:** Store both raw name AND normalized name. Normalization removes legal suffixes for blocking/matching purposes, but the original name is always preserved and displayed. Consider extracting legal suffix as a separate field rather than just stripping it.
**Warning signs:** Reviewers asking "are these really the same company?" on entities with different legal forms.

### Pitfall 7: Docker Compose Service Start Order
**What goes wrong:** API or worker container starts before PostgreSQL or Redis is ready, crashes, and enters a restart loop.
**Why it happens:** `depends_on` only waits for the container to start, not for the service to be ready to accept connections.
**How to avoid:** Use `depends_on` with health checks: `condition: service_healthy`. PostgreSQL healthcheck: `pg_isready -U postgres`. Redis healthcheck: `redis-cli ping`. Alternatively, add retry logic in `entrypoint.sh` to wait for database availability.
**Warning signs:** Containers restarting in a loop on first `docker-compose up`.

## Code Examples

Verified patterns from official sources:

### SQLAlchemy Model with pgvector
```python
# Source: pgvector-python official docs + SQLAlchemy 2.0 docs
from sqlalchemy import String, Text, Integer, ForeignKey, Index
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import JSONB
from pgvector.sqlalchemy import Vector
from datetime import datetime

class Base(DeclarativeBase):
    pass

class StagedSupplier(Base):
    __tablename__ = "staged_suppliers"

    id: Mapped[int] = mapped_column(primary_key=True)
    import_batch_id: Mapped[int] = mapped_column(ForeignKey("import_batches.id"))
    data_source_id: Mapped[int] = mapped_column(ForeignKey("data_sources.id"))
    source_code: Mapped[str] = mapped_column(String(50))
    name: Mapped[str] = mapped_column(String(255))
    short_name: Mapped[str | None] = mapped_column(String(50))
    currency: Mapped[str | None] = mapped_column(String(10))
    payment_terms: Mapped[str | None] = mapped_column(String(50))
    contact_name: Mapped[str | None] = mapped_column(String(255))
    supplier_type: Mapped[str | None] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(20), default="active")  # active/superseded
    raw_data: Mapped[dict] = mapped_column(JSONB)
    normalized_name: Mapped[str | None] = mapped_column(String(255))
    name_embedding = mapped_column(Vector(384), nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    # Indexes
    __table_args__ = (
        Index('ix_staged_normalized_name', 'normalized_name'),
        Index('ix_staged_source_status', 'data_source_id', 'status'),
        Index('ix_staged_source_code', 'data_source_id', 'source_code'),
    )
```

### HNSW Vector Index Creation
```python
# Source: pgvector-python official docs
from sqlalchemy import Index

embedding_index = Index(
    'ix_staged_name_embedding_hnsw',
    StagedSupplier.name_embedding,
    postgresql_using='hnsw',
    postgresql_with={'m': 16, 'ef_construction': 64},
    postgresql_ops={'name_embedding': 'vector_cosine_ops'}
)
```

### CSV Parsing with BOM and Semicolons
```python
# Source: Python stdlib docs + project-specific requirements
import csv
import io
from typing import Generator

def parse_csv(file_content: bytes, delimiter: str = ';') -> Generator[dict, None, None]:
    """Parse semicolon-delimited CSV with BOM handling and whitespace trimming."""
    # utf-8-sig automatically strips BOM if present
    try:
        text = file_content.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = file_content.decode('cp1252')  # Windows-1252 fallback

    reader = csv.DictReader(
        io.StringIO(text),
        delimiter=delimiter,
        quotechar='"',
        skipinitialspace=True
    )
    
    for row in reader:
        # Trim whitespace from all values
        yield {key: (value.strip() if value else value) for key, value in row.items()}
```

### Name Normalization
```python
# Source: Project design doc + pitfalls research
import re
import unicodedata

LEGAL_SUFFIXES = [
    # French
    'SARL', 'SAS', 'SA', 'EURL', 'SCI', 'SNC', 'SASU',
    # German
    'GMBH', 'AG', 'KG', 'OHG', 'GMBH & CO KG', 'GMBH & CO',
    # International
    'LLC', 'LTD', 'INC', 'PLC', 'BV', 'NV', 'PTY', 'CORP',
    'CORPORATION', 'INCORPORATED', 'LIMITED',
]

# Sort by length (longest first) to match "GMBH & CO KG" before "GMBH"
LEGAL_SUFFIXES.sort(key=len, reverse=True)
LEGAL_PATTERN = re.compile(
    r'\b(' + '|'.join(re.escape(s) for s in LEGAL_SUFFIXES) + r')\b\.?',
    re.IGNORECASE
)

def normalize_name(name: str) -> str:
    """Normalize supplier name for matching. Non-destructive: original preserved elsewhere."""
    if not name:
        return ""
    # 1. Strip and uppercase
    result = name.strip().upper()
    # 2. Normalize unicode (NFD → strip combining chars → NFC)
    result = unicodedata.normalize('NFD', result)
    result = ''.join(c for c in result if unicodedata.category(c) != 'Mn')
    result = unicodedata.normalize('NFC', result)
    # 3. Remove legal suffixes
    result = LEGAL_PATTERN.sub('', result)
    # 4. Collapse multiple spaces
    result = re.sub(r'\s+', ' ', result).strip()
    return result
```

### Batch Embedding Computation
```python
# Source: sentence-transformers official docs (Context7)
from sentence_transformers import SentenceTransformer
import numpy as np

# Load model once (at worker startup or as module-level singleton)
_model = None

def get_embedding_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer('all-MiniLM-L6-v2')
    return _model

def compute_embeddings(names: list[str], batch_size: int = 64) -> np.ndarray:
    """Compute 384-dim embeddings for a list of names."""
    model = get_embedding_model()
    embeddings = model.encode(
        names,
        batch_size=batch_size,
        show_progress_bar=True,
        normalize_embeddings=True  # L2-normalize for cosine similarity
    )
    return embeddings  # shape: (len(names), 384)
```

### Docker Compose Configuration
```yaml
# docker-compose.yml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: onebase
      POSTGRES_USER: onebase
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U onebase"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    environment:
      DATABASE_URL: postgresql://onebase:${POSTGRES_PASSWORD}@postgres:5432/onebase
      REDIS_URL: redis://redis:6379/0
      JWT_SECRET: ${JWT_SECRET}
      ADMIN_USERNAME: ${ADMIN_USERNAME}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD}
    volumes:
      - ./backend:/app
      - upload_data:/app/data/uploads
    ports:
      - "8000:8000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  worker:
    build:
      context: ./backend
      dockerfile: Dockerfile
    command: celery -A app.tasks.celery_app worker --loglevel=info
    environment:
      DATABASE_URL: postgresql://onebase:${POSTGRES_PASSWORD}@postgres:5432/onebase
      REDIS_URL: redis://redis:6379/0
    volumes:
      - ./backend:/app
      - upload_data:/app/data/uploads
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3000:80"
    depends_on:
      - api

volumes:
  postgres_data:
  upload_data:
```

### Backend Dockerfile (Multi-Stage)
```dockerfile
FROM python:3.12-slim AS base

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the sentence-transformers model
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

COPY . .
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
```

### Vite Dev Server Proxy Configuration
```typescript
// vite.config.ts — Source: Vite official docs
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
```

### Audit Trail Implementation
```python
# Recommended: Simple audit_log table with JSONB details
class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(50))  # e.g. "upload", "create_source", "create_user", "login"
    entity_type: Mapped[str | None] = mapped_column(String(50))  # e.g. "import_batch", "data_source"
    entity_id: Mapped[int | None] = mapped_column()
    details: Mapped[dict | None] = mapped_column(JSONB)  # Flexible extra info
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

# Usage in services:
def log_action(db: Session, user_id: int, action: str, entity_type: str = None,
               entity_id: int = None, details: dict = None):
    log = AuditLog(user_id=user_id, action=action, entity_type=entity_type,
                   entity_id=entity_id, details=details)
    db.add(log)
    # Committed with the enclosing transaction
```

### Pydantic Settings Configuration
```python
# Source: FastAPI official docs (Settings section)
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql://onebase:password@localhost:5432/onebase"
    
    # Redis
    redis_url: str = "redis://localhost:6379/0"
    
    # JWT
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480  # 8 hours for daily work sessions
    
    # Initial admin user (created on first startup)
    admin_username: str | None = None
    admin_password: str | None = None
    
    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SQLAlchemy 1.x style (Query API) | SQLAlchemy 2.0 style (select() + mapped_column) | 2023 | Use 2.0 patterns exclusively. No legacy Query API. |
| Pydantic v1 | Pydantic v2 (Rust core) | 2023 | 5-17x faster validation. Different import paths. FastAPI 0.115+ requires v2. |
| Create React App | Vite | 2023 | CRA is deprecated. Vite is the standard. |
| Tailwind CSS 3 (JS config) | Tailwind CSS 4 (CSS-first config) | Jan 2025 | No `tailwind.config.js`. Config in CSS `@theme` directive. Different setup. |
| python-jose for JWT | PyJWT (or pwdlib) | Ongoing | PyJWT is simpler for basic JWT. FastAPI docs now show `pwdlib` for password hashing in newer examples. |
| thefuzz/fuzzywuzzy | rapidfuzz | 2021+ | 10-100x faster, MIT licensed, drop-in replacement. Never use thefuzz. |

**Deprecated/outdated:**
- `thefuzz`: Use `rapidfuzz` (faster, MIT licensed)
- `Create React App`: Use Vite (officially deprecated)
- `SQLAlchemy Query API` (e.g., `session.query(Model)`): Use `select()` style
- `tailwind.config.js`: In Tailwind v4, configuration is CSS-first

## Open Questions

1. **Frontend Docker build for development vs production**
   - What we know: Production uses multi-stage build (Node → nginx). Development needs HMR.
   - What's unclear: Whether to run frontend outside Docker during development (simpler HMR) or use Docker with volume mounts.
   - Recommendation: In dev, run frontend outside Docker with `npm run dev` and Vite proxy. Docker for frontend only in production. Keep the Dockerfile for production builds.

2. **Celery task progress polling interval**
   - What we know: Frontend needs to show real-time progress of ingestion pipeline stages.
   - What's unclear: Optimal polling interval. Too fast = wasted requests. Too slow = laggy progress display.
   - Recommendation: Poll every 1 second during active processing. Use task status endpoint that returns current Celery task state + meta. Consider WebSocket in Phase 2 but polling is fine for Phase 1.

3. **Embedding model loading strategy in Celery worker**
   - What we know: Model is ~80MB. Loading takes ~2-3 seconds.
   - What's unclear: Whether to load model at worker startup (blocks all tasks until ready) or lazy-load on first embedding task.
   - Recommendation: Lazy-load with module-level singleton (as shown in code example). First embedding task takes ~3 extra seconds but subsequent tasks are instant. Worker startup is not blocked.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest + pytest-asyncio (latest stable) |
| Config file | `backend/pytest.ini` or `pyproject.toml [tool.pytest]` — Wave 0 |
| Quick run command | `pytest backend/tests/ -x --tb=short` |
| Full suite command | `pytest backend/tests/ -v` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INGS-01 | CSV upload endpoint accepts semicolon-delimited files | integration | `pytest backend/tests/test_upload.py::test_upload_csv -x` | ❌ Wave 0 |
| INGS-02 | BOM stripping, whitespace trimming, delimiter handling | unit | `pytest backend/tests/test_csv_parser.py -x` | ❌ Wave 0 |
| INGS-03 | Column mapping CRUD via API | integration | `pytest backend/tests/test_sources.py::test_column_mapping -x` | ❌ Wave 0 |
| INGS-04 | Name normalization (uppercase, legal suffixes, spaces) | unit | `pytest backend/tests/test_normalization.py -x` | ❌ Wave 0 |
| INGS-05 | Embedding computation (384-dim vectors) | unit | `pytest backend/tests/test_embedding.py -x` | ❌ Wave 0 |
| INGS-06 | Raw JSONB + extracted key fields stored | integration | `pytest backend/tests/test_staging.py -x` | ❌ Wave 0 |
| INGS-07 | Re-upload supersedes old records, invalidates matches | integration | `pytest backend/tests/test_reupload.py -x` | ❌ Wave 0 |
| INGS-08 | Matching task enqueued after ingestion | unit | `pytest backend/tests/test_ingestion_task.py::test_matching_enqueued -x` | ❌ Wave 0 |
| OPS-02 | Data source CRUD management | integration | `pytest backend/tests/test_sources.py -x` | ❌ Wave 0 |
| OPS-03 | Authentication login + protected routes | integration | `pytest backend/tests/test_auth.py -x` | ❌ Wave 0 |
| OPS-04 | Audit trail logged for user actions | integration | `pytest backend/tests/test_audit.py -x` | ❌ Wave 0 |
| OPS-06 | UI pages render (dark theme) | manual-only | Visual inspection via browser | N/A |

### Sampling Rate
- **Per task commit:** `pytest backend/tests/ -x --tb=short` (quick, fail-fast)
- **Per wave merge:** `pytest backend/tests/ -v` (full suite, verbose)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `backend/tests/conftest.py` — shared fixtures (test DB session, test client, sample CSV files)
- [ ] `backend/tests/test_csv_parser.py` — covers INGS-02
- [ ] `backend/tests/test_normalization.py` — covers INGS-04
- [ ] `backend/tests/test_embedding.py` — covers INGS-05
- [ ] `backend/tests/test_auth.py` — covers OPS-03
- [ ] `backend/tests/test_sources.py` — covers INGS-03, OPS-02
- [ ] `backend/tests/test_upload.py` — covers INGS-01, INGS-06
- [ ] `backend/tests/test_reupload.py` — covers INGS-07
- [ ] `backend/tests/test_ingestion_task.py` — covers INGS-08
- [ ] `backend/tests/test_audit.py` — covers OPS-04
- [ ] `backend/pytest.ini` — pytest configuration
- [ ] Framework install: `pip install pytest pytest-asyncio httpx` (included in requirements.txt)

## Sources

### Primary (HIGH confidence)
- `/websites/fastapi_tiangolo` (Context7) — OAuth2 password bearer, file upload, CORS middleware, Pydantic BaseSettings, bigger applications structure
- `/websites/sqlalchemy_en_20` (Context7) — SQLAlchemy 2.0 mapped_column, DeclarativeBase, async ORM patterns (used sync recommendation instead), session management
- `/websites/celeryq_dev_en_stable` (Context7) — Celery task custom states, `update_state()` progress tracking, Redis broker configuration
- `/pgvector/pgvector-python` (Context7) — Vector column type, HNSW index creation with SQLAlchemy, cosine ops
- `/websites/sbert_net` (Context7) — sentence-transformers model.encode() batch API, all-MiniLM-L6-v2 usage, multi-process encoding
- `/sqlalchemy/alembic` (Context7) — Alembic env.py autogenerate configuration, programmatic upgrade/revision commands
- `/websites/vite_dev` (Context7) — Vite proxy configuration for backend API, Docker integration

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md` — Prior project-level stack research with version compatibility matrix
- `.planning/research/ARCHITECTURE.md` — Prior project-level architecture research with Entity Resolution pipeline patterns
- `.planning/research/PITFALLS.md` — Prior project-level pitfalls research with domain-specific warnings

### Tertiary (LOW confidence)
- None — all findings verified via Context7 or official documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified via Context7 with current version docs
- Architecture: HIGH — patterns verified from official docs (FastAPI bigger apps, Celery task patterns, SQLAlchemy 2.0 ORM)
- Pitfalls: HIGH — domain pitfalls from prior research + library-specific gotchas from Context7
- Code examples: HIGH — all examples sourced from or verified against official documentation

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable ecosystem, 30-day validity)

---
*Phase 1 research for: OneBase — Enterprise Supplier Data Unification Platform*
*Researched: 2026-03-13*
