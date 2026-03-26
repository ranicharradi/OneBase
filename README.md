# OneBase

> Enterprise supplier data unification platform. Ingest supplier CSVs from multiple sources, deduplicate via multi-signal matching (text similarity + vector embeddings), review matches with a human-in-the-loop UI, and produce golden unified supplier records with full field-level provenance.

## How It Works

```
CSV Upload → Ingestion → Blocking → Scoring → Clustering → Human Review → Unified Record
             (Celery)    ──────────(Celery)──────────────    (UI/API)    (API)
```

1. **Configure a data source** with column mapping for your CSV format
2. **Upload a CSV** — the system normalizes fields and generates 384-dim sentence-transformer embeddings
3. **Automatic matching** finds duplicate candidates using weighted signals:
   - Jaro-Winkler string similarity (weight: 0.30)
   - Token Jaccard overlap (weight: 0.20)
   - Embedding cosine similarity (weight: 0.25)
   - Short name (0.10), currency (0.05), contact match (0.10)
4. **Review queue** presents match candidates for human confirmation, rejection, or skip
5. **Merge** creates a unified supplier record with per-field provenance tracking source, reviewer, and timestamp

## Quick Start (Docker)

```bash
# Configure environment
cd OneBase && cp .env.example .env
# Edit .env: set JWT_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD, POSTGRES_PASSWORD

# Start all services and verify health
docker-compose up -d
docker-compose ps

# Open http://localhost:3000 and login with your ADMIN_USERNAME / ADMIN_PASSWORD
```

## Quick Start (Local Development)

```bash
# 1. Start databases only
cd OneBase && docker-compose up -d postgres redis

# 2. Backend setup (from backend/)
# On Debian/Ubuntu, you may need: sudo apt install python3.12-venv
cd OneBase/backend
python3 -m venv .venv && source .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
ENV_PROFILE=dev alembic upgrade head
ENV_PROFILE=dev uvicorn app.main:app --reload    # API on :8000

# 3. In a second terminal — Celery worker (needed for uploads and matching)
cd OneBase/backend && source .venv/bin/activate
ENV_PROFILE=dev celery -A app.tasks.celery_app worker --loglevel=info --concurrency=2

# 4. Frontend (from frontend/)
cd OneBase/frontend
npm install
npm run dev    # Vite dev server on :5173, proxies /api → :8000

# Open http://localhost:5173 — login with admin / changeme
```

## API Usage

All endpoints are prefixed with `/api/`. Authentication uses JWT Bearer tokens via OAuth2.

### Authenticate

```bash
# Login — returns a JWT access token
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=changeme"

# Response: { "access_token": "eyJ...", "token_type": "bearer" }

# Use the token for all subsequent requests
export TOKEN="eyJ..."
```

### Create a Data Source

```bash
# Define a data source with column mapping for your CSV format
curl -X POST http://localhost:8000/api/sources \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SAP Suppliers",
    "description": "Monthly SAP vendor export",
    "column_mapping": {
      "name": "VENDOR_NAME",
      "address": "STREET_ADDRESS",
      "city": "CITY",
      "country": "COUNTRY_CODE",
      "tax_id": "TAX_NUMBER",
      "contact_email": "EMAIL"
    }
  }'
```

### Upload a CSV and Track Progress

```bash
# Upload a CSV — triggers async ingestion + matching pipeline
curl -X POST http://localhost:8000/api/import/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@suppliers.csv" \
  -F "source_id=1"

# Response: { "task_id": "abc-123", "batch_id": 1, ... }

# Poll task progress until state is "completed"
curl http://localhost:8000/api/import/batches/abc-123/status \
  -H "Authorization: Bearer $TOKEN"

# Response: { "state": "completed", "progress": 100, "total_rows": 500, ... }
```

### Review Match Candidates

```bash
# Get the pending review queue (paginated)
curl "http://localhost:8000/api/review/queue?page=1&per_page=20" \
  -H "Authorization: Bearer $TOKEN"

# Confirm a match — merges the suppliers into a unified record
curl -X POST http://localhost:8000/api/review/42/confirm \
  -H "Authorization: Bearer $TOKEN"

# Reject a false positive
curl -X POST http://localhost:8000/api/review/43/reject \
  -H "Authorization: Bearer $TOKEN"

# Skip for later review
curl -X POST http://localhost:8000/api/review/44/skip \
  -H "Authorization: Bearer $TOKEN"
```

### Browse Unified Suppliers with Provenance

```bash
# List unified supplier records
curl "http://localhost:8000/api/unified?page=1&per_page=50" \
  -H "Authorization: Bearer $TOKEN"

# Get a single unified supplier — includes field-level provenance
curl http://localhost:8000/api/unified/1 \
  -H "Authorization: Bearer $TOKEN"

# Provenance tracks which source provided each field, who reviewed it, and when:
# {
#   "name": "Acme Corp",
#   "provenance": {
#     "name":    { "source": "SAP", "record_id": 101, "reviewer": "admin", "timestamp": "..." },
#     "address": { "source": "Oracle", "record_id": 55, "reviewer": "admin", "timestamp": "..." }
#   }
# }
```

### WebSocket Notifications

```javascript
// Connect to WebSocket for real-time task updates
const ws = new WebSocket("ws://localhost:8000/ws?token=YOUR_JWT");

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Event types: "ingestion_complete", "matching_complete", "matching_progress"
  console.log(`Task ${data.task_id}: ${data.type} — ${data.progress}%`);
};
```

### Retrain Matching Weights

```bash
# After 20+ human reviews, optimize signal weights from confirmed/rejected decisions
curl -X POST http://localhost:8000/api/matching/retrain \
  -H "Authorization: Bearer $TOKEN"

# Response: updated weights based on review history
```

## Environment Configuration

OneBase uses layered `.env` files controlled by `ENV_PROFILE`:

```bash
# Local development — loads .env then overlays .env.dev (localhost hostnames)
ENV_PROFILE=dev uvicorn app.main:app --reload

# Production — loads .env then overlays .env.prod (real hosts, strong secrets)
ENV_PROFILE=prod celery -A app.tasks.celery_app worker

# Docker Compose — uses .env only (Docker service hostnames: "postgres", "redis")
docker-compose up -d
```

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://onebase:changeme@postgres:5432/onebase` | PostgreSQL connection string |
| `REDIS_URL` | `redis://redis:6379/0` | Redis connection for Celery |
| `JWT_SECRET` | `change-me-in-production` | Secret for signing JWT tokens |
| `ADMIN_USERNAME` | — | Initial admin user (created on first startup) |
| `ADMIN_PASSWORD` | — | Initial admin password |
| `MATCHING_CONFIDENCE_THRESHOLD` | `0.45` | Minimum score to surface a match candidate |
| `MATCHING_BLOCKING_K` | `20` | Nearest neighbors for vector blocking |
| `MATCHING_MAX_CLUSTER_SIZE` | `50` | Maximum suppliers in one match cluster |

## Testing

```bash
cd backend && source .venv/bin/activate

# Run the full test suite (uses SQLite for speed)
python3 -m pytest

# Run a specific test file
python3 -m pytest tests/test_matching_service.py

# Run a single test with verbose output
python3 -m pytest tests/test_auth.py::test_login_success -v

# Integration test against a real PostgreSQL database
TEST_DATABASE_URL=postgresql://user:pass@localhost/testdb python3 -m pytest

# Create a new database migration after changing models
alembic revision --autogenerate -m "add_new_column"
```

## Frontend Development

```bash
cd frontend
npm install       # install dependencies
npm run dev       # Vite dev server on :5173 (proxies /api → :8000, /ws → ws://:8000)
npm run build     # TypeScript check + Vite production build
npm run lint      # ESLint
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend API | Python 3.12, FastAPI, SQLAlchemy |
| Database | PostgreSQL 16 + pgvector (384-dim HNSW index) |
| Task Queue | Celery + Redis |
| ML | sentence-transformers (all-MiniLM-L6-v2), rapidfuzz |
| Frontend | React 19, TypeScript, Vite 8 (Rolldown), TanStack Query, Tailwind CSS v4 |
| Routing | React Router v7 |
| Deployment | Docker Compose, Nginx |

## Services

| Service | Port | Description |
|---------|------|-------------|
| frontend | 3000 | React app served by Nginx (proxies API/WS to backend) |
| api | 8000 | FastAPI server with auto-reload |
| worker | — | Celery worker for ingestion and matching tasks |
| postgres | 5432 | PostgreSQL with pgvector extension |
| redis | 6379 | Celery broker and result backend |

## Re-upload Handling

When a CSV is re-uploaded for an existing data source, OneBase automatically:
- Marks old `StagedSupplier` rows as **superseded**
- Invalidates their associated `MatchCandidate` records
- Runs fresh matching against the new data

This ensures the unified view always reflects the latest source data without manual cleanup.
