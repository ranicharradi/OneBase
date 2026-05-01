# OneBase

> Enterprise supplier data unification platform. Ingest supplier CSVs from multiple sources, deduplicate via multi-signal matching (text similarity + vector embeddings + ML classification), review matches with a human-in-the-loop UI, and produce golden unified supplier records with full field-level provenance.

## How It Works

```
CSV Upload → Ingestion → Blocking → Scoring → Clustering → Human Review → Unified Record
             (Celery)    ──────────(Celery)──────────────    (UI/API)    (API)
```

1. **Configure a data source** with column mapping for your CSV format (or let auto-detection guess it)
2. **Upload a CSV** — the system normalizes fields, deduplicates within-source, and generates 384-dim sentence-transformer embeddings
3. **Automatic matching** finds duplicate candidates across sources using weighted signals:
   - Jaro-Winkler string similarity (0.30)
   - Token Jaccard overlap (0.20)
   - Embedding cosine similarity (0.25)
   - Short name (0.10), currency (0.05), contact match (0.10)
   - Optional: LightGBM classifier trained from review decisions replaces weighted-sum scoring
4. **Review queue** presents match candidates for human confirmation or rejection
5. **Merge** creates a unified supplier record with per-field provenance tracking source, reviewer, and timestamp

## Quick Start (Docker)

```bash
cp .env.example .env
# Edit .env: set JWT_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD, POSTGRES_PASSWORD

docker-compose up -d
# Open http://localhost:3000 — login with your ADMIN_USERNAME / ADMIN_PASSWORD
```

## Quick Start (Local Development)

```bash
# 1. Start databases only
docker-compose up -d postgres redis

# 2. Backend (from backend/)
python3 -m venv .venv && source .venv/bin/activate
cd backend
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements-dev.txt
ENV_PROFILE=dev alembic upgrade head
ENV_PROFILE=dev uvicorn app.main:app --reload    # API on :8000

# 3. Celery worker (second terminal, venv activated)
cd backend && source .venv/bin/activate
ENV_PROFILE=dev celery -A app.tasks.celery_app worker --loglevel=info --concurrency=2

# 4. Frontend (from frontend/)
cd frontend
npm install
npm run dev    # Vite on :5173, proxies /api → :8000

# Open http://localhost:5173 — login with admin / changeme
```

> The Celery worker is only needed for uploads and matching. The UI loads without it.

## API Usage

All endpoints are prefixed with `/api/`. Authentication uses JWT Bearer tokens.

### Authenticate

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=changeme"
# → { "access_token": "eyJ...", "token_type": "bearer" }

export TOKEN="eyJ..."
```

### Create a Data Source

```bash
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

### Upload a CSV

```bash
curl -X POST http://localhost:8000/api/import/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@suppliers.csv" \
  -F "source_id=1"
# → { "task_id": "abc-123", "batch_id": 1, ... }

# Poll until state is "completed"
curl http://localhost:8000/api/import/batches/abc-123/status \
  -H "Authorization: Bearer $TOKEN"
```

### Review Matches

```bash
# Pending review queue
curl "http://localhost:8000/api/review/queue?page=1&per_page=20" \
  -H "Authorization: Bearer $TOKEN"

# Confirm a match (merges into unified record)
curl -X POST http://localhost:8000/api/review/42/confirm \
  -H "Authorization: Bearer $TOKEN"

# Reject a false positive
curl -X POST http://localhost:8000/api/review/43/reject \
  -H "Authorization: Bearer $TOKEN"
```

### Unified Suppliers with Provenance

```bash
curl http://localhost:8000/api/unified/1 \
  -H "Authorization: Bearer $TOKEN"
# Each field tracks its source record, reviewer, and timestamp:
# { "name": "Acme Corp", "provenance": {
#     "name":    { "source": "SAP", "record_id": 101, "reviewer": "admin", ... },
#     "address": { "source": "Oracle", "record_id": 55, "reviewer": "admin", ... }
# }}
```

### WebSocket Notifications

```javascript
const ws = new WebSocket("ws://localhost:8000/ws?token=YOUR_JWT");
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Types: "ingestion_complete", "matching_complete", "matching_progress"
  console.log(`${data.type} — ${data.progress}%`);
};
```

### Train ML Model

```bash
# After 20+ reviews, train a LightGBM classifier from review decisions
curl -X POST http://localhost:8000/api/matching/train-model \
  -H "Authorization: Bearer $TOKEN"
```

## Environment Configuration

Layered `.env` files controlled by `ENV_PROFILE`:

```bash
ENV_PROFILE=dev uvicorn app.main:app --reload   # .env → .env.dev (localhost)
ENV_PROFILE=prod celery -A ...                  # .env → .env.prod (real hosts)
docker-compose up -d                            # .env only (Docker hostnames)
```

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://onebase:changeme@postgres:5432/onebase` | PostgreSQL connection string |
| `REDIS_URL` | `redis://redis:6379/0` | Redis for Celery broker/backend |
| `JWT_SECRET` | `change-me-in-production` | JWT signing secret |
| `ADMIN_USERNAME` | — | Initial admin user (created on first startup) |
| `ADMIN_PASSWORD` | — | Initial admin password |
| `MATCHING_CONFIDENCE_THRESHOLD` | `0.45` | Minimum score to surface a match candidate |
| `MATCHING_BLOCKING_K` | `20` | Nearest neighbors for vector blocking |
| `MATCHING_MAX_CLUSTER_SIZE` | `50` | Maximum suppliers in one match cluster |

## Testing

```bash
cd backend && source .venv/bin/activate

python3 -m pytest                                # full suite (~336 tests, SQLite)
python3 -m pytest -m "not slow"                  # skip ML/embedding tests (fast dev loop)
python3 -m pytest tests/test_auth.py -v          # single file
python3 -m pytest tests/test_auth.py::test_login_success -v  # single test

# Integration test against PostgreSQL
TEST_DATABASE_URL=postgresql://user:pass@localhost/testdb python3 -m pytest

# New migration after model changes
alembic revision --autogenerate -m "description"
```

## Frontend

```bash
cd frontend
npm install       # install dependencies
npm run dev       # Vite dev server on :5173
npm run build     # tsc + Vite production build
npm run lint      # ESLint
npm run test      # vitest (run once)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend API | Python 3.12, FastAPI, SQLAlchemy |
| Database | PostgreSQL 16 + pgvector (384-dim HNSW index) |
| Task Queue | Celery + Redis |
| ML | sentence-transformers (all-MiniLM-L6-v2), LightGBM, rapidfuzz |
| Frontend | React 19, TypeScript, Vite 8 (Rolldown), TanStack Query, Tailwind CSS v4 |
| Routing | React Router v7 |
| Deployment | Docker Compose, Nginx |

## Services

| Service | Port | Description |
|---------|------|-------------|
| frontend | 3000 | React app via Nginx (proxies API/WS to backend) |
| api | 8000 | FastAPI server |
| worker | — | Celery worker for ingestion and matching |
| postgres | 5432 | PostgreSQL with pgvector |
| redis | 6379 | Celery broker and result backend |

## Documentation

See [`docs/`](docs/) for detailed documentation:

- [`docs/architecture/`](docs/architecture/) — Project structure reference
- [`docs/design/`](docs/design/) — Feature design documents (upload flow, column mapping, matching pipeline, ML scorer)
- [`docs/backlog/`](docs/backlog/) — Known gaps and planned work
