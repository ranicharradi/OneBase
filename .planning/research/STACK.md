# Stack Research

**Domain:** Enterprise Supplier Data Unification / Record Linkage Platform
**Researched:** 2026-03-13
**Confidence:** HIGH

## Recommended Stack

### Core Technologies — Backend

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Python | 3.12 | Runtime | Mature async support, best library ecosystem for ML/NLP/record linkage. 3.12 offers significant performance improvements (10-15% faster). 3.13 is available but 3.12 has broader library compatibility. |
| FastAPI | ~0.115.14 | API framework | Async-native, Pydantic v2 validation, WebSocket support built-in (needed for job notifications), auto-generated OpenAPI docs. Dominant Python API framework for new projects. |
| Pydantic | ~2.12.5 | Data validation & serialization | FastAPI's native validation layer. v2 is 5-17x faster than v1 (Rust core). Handles CSV field mapping schemas, API request/response models, and settings management. |
| SQLAlchemy | ~2.0.45 | ORM + database toolkit | Industry standard Python ORM. 2.0 style (not 2.1 — still in dev) uses modern `select()` syntax, type-annotated mapped columns, and mature async support with `asyncpg`. Alembic integration for migrations. |
| Alembic | ~1.18.4 | Database migrations | Official SQLAlchemy migration tool. Auto-generate migrations from model changes. Essential for schema evolution as the platform grows. |
| Celery | ~5.6.2 | Distributed task queue | De facto standard for Python async task processing. Handles CPU-intensive matching jobs (embedding generation, blocking, pairwise comparison) without blocking the API. Redis broker is simplest setup for on-prem. |
| Redis | 7.x | Message broker + cache | Celery broker + result backend. Also usable for WebSocket pub/sub (matching job completion notifications). Lightweight, battle-tested. |
| PostgreSQL | 16 | Primary database | Robust JSONB for raw supplier data storage, pgvector extension for embedding similarity search, mature ecosystem. PG16 is stable and widely supported (PG17 available but PG16 has more extension compatibility testing). |
| pgvector | 0.8.x | Vector similarity search | Keeps embeddings in PostgreSQL — no separate vector DB. HNSW indexes for fast ANN search on 384-dim embeddings. Supports cosine, L2, and inner product distance. `pgvector/pgvector:pg16` Docker image available. |

### Core Technologies — Frontend

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| React | 19.x (19.1.5+) | UI framework | Dominant frontend framework. React 19 stable since Dec 2024. Hooks-based architecture ideal for complex data-heavy review UIs. Massive ecosystem. |
| Vite | 6.x | Build tool & dev server | Instant HMR, fast builds. Vite 6 is the latest stable (v7/v8 exist but 6.x is the proven stable). Replaces CRA which is officially deprecated. |
| TypeScript | ~5.7 | Type safety | Catches bugs at compile time in the complex review/merge UI logic. Non-negotiable for enterprise data apps. |
| React Router | 7.x | Client-side routing | Latest stable, non-breaking upgrade from v6. Handles navigation between dashboard, review queue, match detail, unified view, sources pages. |
| TanStack Query | 5.x | Server state management | Handles API data fetching, caching, background refetching. Perfect for review queue pagination, polling for job status, optimistic updates on merge decisions. |
| TanStack Table | 8.x | Data grid / tables | Headless table library — 100% control over styling. Sorting, filtering, pagination for supplier lists and review queues. Enterprise-grade without the enterprise price tag. |
| Tailwind CSS | 4.x | Utility-first CSS | Fast dark-theme enterprise UI development. v4 released Jan 2025 — CSS-first config, significant performance improvements. Pairs with frontend-design skill for production-grade UIs. |

### ML / Matching Libraries

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| sentence-transformers | ~5.3.0 | Embedding generation | Latest stable (Mar 2026). Loads `all-MiniLM-L6-v2` model for 384-dim name embeddings. CPU-friendly, ~80MB model. Supports ONNX/OpenVINO backends for faster CPU inference. |
| rapidfuzz | ~3.14.3 | Fuzzy string matching | **Use instead of `thefuzz`**. Drop-in replacement that is 10-100x faster (C++ core). Provides Jaro-Winkler, Levenshtein, token sort/set ratios. MIT licensed (thefuzz forces GPL via python-Levenshtein). |
| scikit-learn | ~1.7.1 | ML classification | Logistic regression for combining match signals into a single score. Also provides StandardScaler for feature normalization. Stable, well-documented. |
| numpy | ~2.x | Numerical computing | Embedding arithmetic, cosine similarity computation, feature matrix operations. Transitive dependency of scikit-learn and sentence-transformers. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| uvicorn | ~0.34.x | ASGI server | Production FastAPI server. Use with `--workers` for multi-process deployment. |
| python-multipart | ~0.0.20 | File upload parsing | Required by FastAPI for CSV file upload endpoints. |
| asyncpg | ~0.30.x | Async PostgreSQL driver | Used by SQLAlchemy async engine for non-blocking DB queries in FastAPI endpoints. |
| psycopg2-binary | ~2.9.x | Sync PostgreSQL driver | Used by Celery workers (Celery doesn't support async). Alembic migrations also use sync connections. |
| websockets | ~14.x | WebSocket support | FastAPI WebSocket connections for real-time job completion notifications. |
| networkx | ~3.4.x | Graph algorithms | Connected components detection for transitive match groups (if supplier A matches B, and B matches C, they form a group). |
| chardet / charset-normalizer | latest | Encoding detection | Handling mixed-encoding CSV files from Sage X3 (UTF-8 BOM, Windows-1252, etc.). |
| python-jose / PyJWT | latest | JWT tokens | Basic auth token generation. PyJWT is simpler for basic username/password auth. |
| passlib[bcrypt] | latest | Password hashing | Secure password storage for local user accounts. |
| httpx | ~0.28.x | HTTP client | For testing FastAPI endpoints (async-compatible test client). |
| pytest + pytest-asyncio | latest | Testing | Test framework with async support for FastAPI and SQLAlchemy async code. |

### Infrastructure & Deployment

| Technology | Version | Purpose | Notes |
|------------|---------|---------|-------|
| Docker | 24+ | Containerization | Multi-stage builds: Python backend, Node frontend, pre-downloaded ML model. |
| Docker Compose | 2.x | Service orchestration | 5 services: api, worker, frontend, postgres, redis. On-prem deployment target. |
| nginx | 1.27+ | Frontend serving / reverse proxy | Serve built React app, proxy API requests to FastAPI. Single entry point. |
| pgvector/pgvector:pg16 | latest | PostgreSQL + pgvector image | Pre-built Docker image with pgvector extension. Eliminates manual extension compilation. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| ruff | Python linter + formatter | Replaces flake8, black, isort. 10-100x faster (Rust). Single tool for all Python code quality. |
| mypy | Static type checking | Catches type errors in match scoring, data transformation, and API contracts. |
| pre-commit | Git hook manager | Run ruff, mypy on commit. Keeps code quality consistent. |
| Vitest | Frontend testing | Fast Vite-native test runner for React component tests. |

## Installation

```bash
# Backend - Core
pip install fastapi[standard] uvicorn[standard] \
    sqlalchemy[asyncio] asyncpg psycopg2-binary alembic \
    celery[redis] redis \
    pydantic pydantic-settings \
    python-multipart websockets

# Backend - ML/Matching
pip install sentence-transformers rapidfuzz scikit-learn \
    numpy networkx

# Backend - Auth
pip install python-jose[cryptography] passlib[bcrypt]

# Backend - Dev
pip install -D ruff mypy pytest pytest-asyncio httpx

# Frontend
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install react-router @tanstack/react-query @tanstack/react-table
npm install -D tailwindcss @tailwindcss/vite vitest
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| FastAPI | Django + DRF | If you need built-in admin panel, ORM migrations out of the box. Django is heavier but has more batteries included. Not needed here — FastAPI's async nature is better for long-running matching jobs. |
| Celery + Redis | Dramatiq, Huey, arq | If you want simpler task queue without Celery's complexity. arq is async-native but less battle-tested. Celery wins on ecosystem maturity and monitoring tools (Flower). |
| rapidfuzz | thefuzz (fuzzywuzzy) | Never — rapidfuzz is strictly better. Faster, MIT licensed, same API. thefuzz has GPL license contamination risk via python-Levenshtein dependency. |
| pgvector (HNSW) | FAISS, Milvus, Qdrant | If you need 1M+ vectors with sub-millisecond search. For ~5-20K suppliers with 384-dim embeddings, pgvector HNSW is plenty fast and eliminates a separate service. |
| SQLAlchemy 2.0 | SQLModel, Tortoise ORM | SQLModel is a thin wrapper by FastAPI creator — convenient but less powerful. Tortoise is Django-style async ORM but less mature. SQLAlchemy 2.0 is the safe choice for complex queries. |
| React + TanStack | Next.js, Remix | If you need SSR, SEO, file-based routing. This is an internal tool — no SEO needed. SPA with React Router is simpler for on-prem Docker deployment. |
| Tailwind CSS 4 | Shadcn/ui, Ant Design, Material UI | Component libraries are valid for faster prototyping. Tailwind + custom components gives more design control for the enterprise dark-theme aesthetic. Shadcn/ui could layer on top of Tailwind if needed. |
| Vite 6 | Webpack, Turbopack | Webpack is legacy. Turbopack is Next.js-specific. Vite is the standard for non-Next React projects. |
| sentence-transformers | direct HuggingFace transformers | If you need fine-grained control over tokenization/model architecture. sentence-transformers wraps this with a clean `encode()` API that's perfect for embedding generation. |
| Custom matching pipeline | Splink 4 | **Considered but not recommended for this project.** Splink is excellent for large-scale probabilistic record linkage (7M+ records). But: (1) it's designed for batch analytics, not embedded in a web app with human review UI; (2) it uses DuckDB/Spark backends, not PostgreSQL; (3) our ~5K suppliers don't need Splink's scale optimizations; (4) custom pipeline gives full control over the review queue, provenance tracking, and feedback loop. |
| Custom matching pipeline | recordlinkage | Useful for prototyping comparison vectors but last release is 0.15, development appears slow. Better to use its concepts (blocking, comparison) with our own implementation using rapidfuzz + sentence-transformers. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `thefuzz` / `fuzzywuzzy` | 10-100x slower than rapidfuzz. GPL license contamination via python-Levenshtein. Last thefuzz release Jan 2024 — stale. | `rapidfuzz` — MIT, C++ core, same API, actively maintained |
| `recordlinkage` (as primary framework) | Last release 0.15 — slow development. Good for prototyping but not for production web-embedded pipeline. | Custom pipeline using rapidfuzz + sentence-transformers + scikit-learn for scoring |
| Splink 4 | Designed for batch analytics on DuckDB/Spark, not for interactive web apps with human review. Overkill for ~5K records. Would require adapting its DuckDB output to feed a review UI. | Custom matching pipeline that writes directly to PostgreSQL review queue tables |
| `dedupe` library | Commercial model (dedupe.io). Active learning approach requires labeling UI that duplicates our review UI. Better to build the feedback loop ourselves with logistic regression. | Custom scoring with scikit-learn LogisticRegression, trained on reviewer decisions |
| SQLAlchemy 2.1 | Still in development (docs exist at /en/21/ but not released stable). Breaking changes possible. | SQLAlchemy 2.0.45 — latest stable release |
| React 18 | React 19 is stable since Dec 2024. No reason to start a new project on 18. | React 19.x |
| Create React App (CRA) | Officially deprecated. No longer maintained. | Vite with React template |
| Webpack | Slower builds, complex config. Vite is the modern standard. | Vite 6 |
| Tailwind CSS 3 | v4 released Jan 2025 with CSS-first config, better performance. No reason to start on v3. | Tailwind CSS 4 |

## Key Design Decisions

### Why Custom Matching Pipeline Over Splink/recordlinkage

The PROJECT.md specifies a multi-signal scoring approach (Jaro-Winkler, token Jaccard, embedding cosine, short name, currency, contact). This is best served by a custom pipeline because:

1. **PostgreSQL-native**: Matching results write directly to review queue tables. No ETL from DuckDB.
2. **Human-in-the-loop**: Every match goes to human review. The pipeline must produce candidate pairs with signal breakdowns, not final clusters.
3. **Provenance**: Field-level merge tracking requires custom data model that Splink doesn't provide.
4. **Feedback loop**: Reviewer decisions retrain signal weights via logistic regression — this needs tight integration with the review UI.
5. **Scale is small**: ~5K suppliers, ~12.5M potential pairs before blocking. With two-pass blocking this reduces to ~50-100K candidate pairs. No need for distributed compute.

### Why rapidfuzz Over thefuzz

- **Performance**: Benchmarks show 10-100x faster for Jaro-Winkler, Levenshtein, and fuzzy ratio operations
- **License**: MIT (rapidfuzz) vs GPL contamination risk (thefuzz uses python-Levenshtein which is GPL)
- **API compatibility**: Drop-in replacement. `from rapidfuzz import fuzz` works identically to `from thefuzz import fuzz`
- **Active development**: rapidfuzz 3.14.3 (Nov 2025) vs thefuzz 0.22.1 (Jan 2024)
- **C++ core**: Compiled extensions, not pure Python. Critical for pairwise comparisons on ~50-100K candidate pairs

### Why pgvector HNSW Over IVFFlat or External Vector DB

- **HNSW**: Better recall, no training step required (IVFFlat needs `CREATE INDEX` with representative data). For 5-20K 384-dim vectors, HNSW builds in seconds.
- **In-PostgreSQL**: No additional service to manage. Embeddings, supplier data, match results, and provenance all in one database.
- **Cosine distance**: `vector_cosine_ops` operator class is exactly what we need for normalized sentence embeddings.
- **Filtered search**: Can combine vector similarity with SQL WHERE clauses (e.g., only cross-entity matches).

## Version Compatibility Matrix

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| FastAPI ~0.115.x | Pydantic ~2.12.x | FastAPI 0.115+ requires Pydantic v2. Do not use Pydantic v1. |
| FastAPI ~0.115.x | SQLAlchemy ~2.0.x | Use `asyncpg` driver for async endpoints. |
| SQLAlchemy ~2.0.x | Alembic ~1.18.x | Alembic tracks SQLAlchemy versions closely. Always upgrade together. |
| Celery ~5.6.x | Redis 7.x | Celery 5.6 supports Python 3.9-3.13. Redis 7 is recommended broker. |
| sentence-transformers ~5.3.x | PyTorch ~2.5.x | sentence-transformers 5.x requires PyTorch 1.11+. Will auto-install torch. |
| sentence-transformers ~5.3.x | Python 3.10+ | Requires Python 3.10+. Compatible with our 3.12 target. |
| rapidfuzz ~3.14.x | Python 3.10+ | C extensions require Python 3.10+. Compatible with 3.12. |
| pgvector 0.8.x | PostgreSQL 14-17 | Use `pgvector/pgvector:pg16` Docker image. |
| React 19.x | React Router 7.x | React Router 7 requires React 18+. |
| Vite 6.x | React 19.x | Use `@vitejs/plugin-react` for JSX support. |
| Tailwind CSS 4.x | Vite 6.x | Use `@tailwindcss/vite` plugin. CSS-first config (no tailwind.config.js). |

## Docker Image Strategy

```dockerfile
# Backend: python:3.12-slim
# - Multi-stage: build stage installs dependencies, runtime copies site-packages
# - Pre-download all-MiniLM-L6-v2 model during build (avoids runtime download)
# - Same image for api and worker services (different CMD)

# Frontend: node:22-alpine (build) → nginx:1.27-alpine (serve)
# - Build React app with Vite
# - Copy dist/ to nginx
# - nginx config: serve static + proxy /api/* to FastAPI

# Database: pgvector/pgvector:pg16
# - Pre-built with pgvector extension

# Redis: redis:7-alpine
# - Default config sufficient for this scale
```

## Sources

- `/fastapi/fastapi` (Context7) — FastAPI background tasks, WebSocket support [HIGH confidence]
- `/websites/sqlalchemy_en_21` (Context7) — SQLAlchemy 2.0/2.1 async support [HIGH confidence]
- `/websites/celeryq_dev_en_stable` (Context7) — Celery Redis broker configuration [HIGH confidence]
- `/websites/sbert_net` (Context7) — sentence-transformers all-MiniLM-L6-v2, ONNX/OpenVINO backends [HIGH confidence]
- `/pgvector/pgvector` (Context7) — pgvector HNSW index creation, cosine distance search [HIGH confidence]
- `/j535d165/recordlinkage` (Context7) — recordlinkage blocking, comparison API [HIGH confidence]
- https://pypi.org/project/fastapi/ — FastAPI 0.115.14 latest (Jul 2025) [HIGH confidence]
- https://pypi.org/project/SQLAlchemy/ — SQLAlchemy 2.0.45 latest (Dec 2025) [HIGH confidence]
- https://pypi.org/project/celery/ — Celery 5.6.2 latest (Jan 2026) [HIGH confidence]
- https://pypi.org/project/sentence-transformers/ — sentence-transformers 5.3.0 latest (Mar 2026) [HIGH confidence]
- https://pypi.org/project/RapidFuzz/ — RapidFuzz 3.14.3 latest (Nov 2025) [HIGH confidence]
- https://pypi.org/project/splink/ — Splink 4.0.16 latest (Mar 2026) [HIGH confidence]
- https://pypi.org/project/pydantic/ — Pydantic 2.12.5 latest (Feb 2026) [HIGH confidence]
- https://pypi.org/project/alembic/ — Alembic 1.18.4 latest [HIGH confidence]
- https://github.com/pgvector/pgvector — pgvector 0.8.2 latest [HIGH confidence]
- https://react.dev/versions — React 19.1.5 latest (Jan 2026) [HIGH confidence]
- https://www.npmjs.com/package/react-router — React Router 7.13.1 latest [HIGH confidence]
- https://www.npmjs.com/package/@tanstack/react-query — TanStack Query 5.90.21 latest [HIGH confidence]
- https://tailwindcss.com/ — Tailwind CSS 4.x latest stable (Jan 2025+) [HIGH confidence]
- https://similarity-api.com/blog/speed-benchmarks — rapidfuzz vs thefuzz benchmarks [MEDIUM confidence]
- https://medium.com/data-science-collective/deduplicating-7-million-records-in-two-minutes-with-splink — Splink scale analysis [MEDIUM confidence]

---
*Stack research for: Enterprise Supplier Data Unification / Record Linkage Platform*
*Researched: 2026-03-13*
