# Architecture Research

**Domain:** Enterprise supplier data unification / record linkage with human-in-the-loop review
**Researched:** 2026-03-13
**Confidence:** HIGH

## Standard Architecture

### System Overview

The architecture follows the well-established **Entity Resolution (ER) pipeline model**, validated by the Resolvi reference architecture (2025) and implemented by every major ER system (JedAI, Splink, Dedupe, Duke, FAMER). The pipeline structures computation as a sequence of processing stages, each transforming input and passing output to the next. OneBase implements a **batch ER pipeline** with a human-in-the-loop review layer between matching and entity profile assembly.

```
┌─────────────────────────────────────────────────────────────────────┐
│                      PRESENTATION LAYER                             │
│  ┌───────────┐ ┌──────────┐ ┌──────────────┐ ┌────────────────┐    │
│  │ Dashboard │ │  Review  │ │   Unified    │ │    Source      │    │
│  │   Page    │ │  Queue   │ │   Browser    │ │   Manager      │    │
│  └─────┬─────┘ └────┬─────┘ └──────┬───────┘ └───────┬────────┘    │
│        └─────────────┴──────────────┴─────────────────┘             │
│                         React SPA                                   │
├─────────────────────────────────────────────────────────────────────┤
│                       API LAYER (FastAPI)                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │ Upload   │ │ Match    │ │ Review   │ │ Unified  │ │  Auth    │ │
│  │ Router   │ │ Router   │ │ Router   │ │ Router   │ │ Router   │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ │
│       └─────────────┴────────────┴─────────────┴────────────┘       │
│                    Services / Business Logic                        │
├─────────────────────────────────────────────────────────────────────┤
│                   ASYNC TASK LAYER (Celery + Redis)                  │
│  ┌──────────────────┐  ┌────────────────────┐  ┌─────────────────┐ │
│  │  Ingestion Task   │  │   Matching Task    │  │  Embedding Task │ │
│  │  (parse+normalize)│  │ (block+compare+    │  │  (sentence-     │ │
│  │                   │  │  score+cluster)    │  │   transformers) │ │
│  └─────────┬─────────┘  └────────┬───────────┘  └────────┬────────┘ │
│            └─────────────────────┴───────────────────────┘          │
│                        WebSocket Notifications                      │
├─────────────────────────────────────────────────────────────────────┤
│                     DATA LAYER (PostgreSQL + pgvector)               │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                │
│  │   Staging     │ │   Match      │ │   Unified    │                │
│  │   Tables      │ │   Tables     │ │   Tables     │                │
│  │ (raw JSONB +  │ │ (candidates, │ │ (golden      │                │
│  │  key fields)  │ │  scores,     │ │  records +   │                │
│  │              │ │  groups)     │ │  provenance)  │                │
│  └──────────────┘ └──────────────┘ └──────────────┘                │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                │
│  │  Embeddings   │ │   Sources    │ │   Users +    │                │
│  │  (pgvector)   │ │   Config     │ │   Audit Log  │                │
│  └──────────────┘ └──────────────┘ └──────────────┘                │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Ingestion Pipeline** | Parse CSV, map columns, normalize names, compute embeddings | Celery task chain: parse → map → normalize → embed |
| **Staging Store** | Hold raw supplier data with full JSONB + extracted key fields | PostgreSQL tables with JSONB column + indexed key columns |
| **Matching Engine** | Generate candidate pairs via blocking, compute multi-signal scores | Celery task: two-pass blocking → pairwise comparison → scoring |
| **Clustering Engine** | Group transitive matches into connected components | Union-Find on match candidates above threshold |
| **Review Queue** | Present match candidates sorted by confidence for human decision | FastAPI endpoints + React UI with filtering/sorting |
| **Merge Engine** | Execute field-by-field merge based on reviewer choices | Service layer: create golden record with full provenance |
| **Unified Store** | Hold golden supplier records with provenance metadata | PostgreSQL tables with field-level source tracking |
| **Source Manager** | Track data sources, column mappings, upload lifecycle | CRUD service with JSON-based column mapping config |
| **Notification Service** | Push real-time updates when async jobs complete | WebSocket connections from FastAPI, triggered by Celery task completion via Redis pub/sub |
| **Auth** | Basic username/password authentication, audit trail | FastAPI dependency with session/token-based auth |

## Recommended Project Structure

```
onebase/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI app initialization, router includes
│   │   ├── config.py            # Settings (Pydantic BaseSettings)
│   │   ├── database.py          # SQLAlchemy engine, session factory
│   │   ├── dependencies.py      # Auth, DB session, shared deps
│   │   ├── models/              # SQLAlchemy ORM models
│   │   │   ├── __init__.py
│   │   │   ├── source.py        # DataSource, ColumnMapping
│   │   │   ├── staging.py       # StagedSupplier
│   │   │   ├── matching.py      # MatchCandidate, MatchGroup
│   │   │   ├── unified.py       # UnifiedSupplier, FieldProvenance
│   │   │   └── user.py          # User, AuditLog
│   │   ├── schemas/             # Pydantic request/response schemas
│   │   │   ├── __init__.py
│   │   │   ├── source.py
│   │   │   ├── staging.py
│   │   │   ├── matching.py
│   │   │   ├── unified.py
│   │   │   └── user.py
│   │   ├── routers/             # FastAPI APIRouters (thin, delegate to services)
│   │   │   ├── __init__.py
│   │   │   ├── upload.py        # CSV upload, re-upload lifecycle
│   │   │   ├── matching.py      # Trigger matching, check status
│   │   │   ├── review.py        # Review queue, match detail, merge actions
│   │   │   ├── unified.py       # Browse unified suppliers
│   │   │   ├── sources.py       # Manage data sources, column mappings
│   │   │   ├── dashboard.py     # Stats, recent activity
│   │   │   └── auth.py          # Login, session management
│   │   ├── services/            # Business logic (stateless, testable)
│   │   │   ├── __init__.py
│   │   │   ├── ingestion.py     # Parse, map, normalize orchestration
│   │   │   ├── matching.py      # Blocking, comparison, scoring logic
│   │   │   ├── clustering.py    # Connected components / union-find
│   │   │   ├── merge.py         # Field-by-field merge, provenance
│   │   │   ├── embedding.py     # sentence-transformers model management
│   │   │   └── notification.py  # WebSocket connection manager
│   │   ├── tasks/               # Celery task definitions
│   │   │   ├── __init__.py
│   │   │   ├── celery_app.py    # Celery app configuration
│   │   │   ├── ingestion.py     # Ingest CSV task (calls services)
│   │   │   └── matching.py      # Run matching pipeline task
│   │   └── utils/               # Shared utilities
│   │       ├── __init__.py
│   │       ├── normalization.py # Name normalization, legal suffix removal
│   │       ├── similarity.py    # Jaro-Winkler, token Jaccard wrappers
│   │       └── csv_parser.py    # BOM stripping, semicolon CSV parsing
│   ├── alembic/                 # Database migrations
│   │   ├── versions/
│   │   └── env.py
│   ├── tests/
│   │   ├── conftest.py
│   │   ├── test_ingestion.py
│   │   ├── test_matching.py
│   │   ├── test_merge.py
│   │   └── test_api/
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── api/                 # API client, typed endpoints
│   │   ├── components/          # Shared UI components
│   │   ├── pages/               # Route-level page components
│   │   │   ├── Dashboard.tsx
│   │   │   ├── ReviewQueue.tsx
│   │   │   ├── MatchDetail.tsx
│   │   │   ├── UnifiedBrowser.tsx
│   │   │   └── SourceManager.tsx
│   │   ├── hooks/               # Custom hooks (useWebSocket, useAuth)
│   │   ├── stores/              # State management
│   │   └── App.tsx
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
└── .planning/
```

### Structure Rationale

- **`models/` separate from `schemas/`:** SQLAlchemy models define DB shape; Pydantic schemas define API contracts. Keeping them separate prevents ORM concerns from leaking into API boundaries.
- **`routers/` are thin:** Routers handle HTTP concerns (request parsing, response formatting). All business logic lives in `services/` — this makes services testable without HTTP.
- **`services/` are stateless:** Services receive a DB session and inputs, return results. No global state. Easy to test with mocked sessions.
- **`tasks/` delegate to services:** Celery tasks are thin wrappers that call service functions. This means matching logic can be tested without Celery infrastructure.
- **`utils/` for pure functions:** Normalization, similarity computation, CSV parsing — these are stateless, pure functions with no DB or service dependencies. Most testable layer.

## Architectural Patterns

### Pattern 1: Pipeline-Stage Entity Resolution

**What:** Structure the ER process as a sequence of discrete stages: Extract → Block → Compare → Score → Cluster → Review → Merge. Each stage has well-defined inputs and outputs.

**When to use:** Always — this is the canonical ER architecture confirmed by every reference system (JedAI, Splink, Dedupe, Duke, FAMER) and the Resolvi reference architecture (2025).

**Trade-offs:**
- (+) Each stage can be developed, tested, and optimized independently
- (+) Easy to add new comparison signals or blocking strategies
- (+) Natural checkpointing — stages persist intermediate results
- (-) More tables and data movement than a monolithic approach
- (-) Re-running a later stage requires re-reading intermediate results

**Example:**
```python
# Celery task implementing the matching pipeline
@celery_app.task(bind=True)
def run_matching_pipeline(self, source_pair_id: int):
    """Pipeline: block → compare → score → cluster"""
    self.update_state(state="BLOCKING", meta={"stage": "blocking"})
    candidate_pairs = blocking_service.generate_candidates(source_pair_id)

    self.update_state(state="COMPARING", meta={"stage": "comparing", "pairs": len(candidate_pairs)})
    scored_pairs = comparison_service.score_pairs(candidate_pairs)

    self.update_state(state="CLUSTERING", meta={"stage": "clustering"})
    match_groups = clustering_service.find_connected_components(scored_pairs)

    self.update_state(state="COMPLETE", meta={"groups": len(match_groups)})
    return {"candidates": len(scored_pairs), "groups": len(match_groups)}
```

### Pattern 2: Two-Pass Blocking (Text + Embedding)

**What:** First pass uses cheap text-based blocking (prefix match, first-token match) to find obvious candidates. Second pass uses pgvector ANN search on name embeddings to find semantically similar suppliers missed by text blocking. Union the results.

**When to use:** When data has name variations that share no prefix/tokens (transliterations, abbreviations, brand vs. legal names). At ~5K suppliers, this is efficient on CPU.

**Trade-offs:**
- (+) Text blocking is fast and catches 70-80% of true matches
- (+) Embedding blocking catches non-obvious matches that text misses
- (+) pgvector HNSW index makes ANN search fast even at scale
- (-) Embedding computation adds overhead (~2-5 seconds for 5K names on CPU)
- (-) Two passes means more candidate pairs to score (mitigated by deduplication)

**Example:**
```python
def generate_candidates(source_pair_id: int) -> set[tuple[int, int]]:
    """Two-pass blocking: text + embedding"""
    candidates = set()

    # Pass 1: Text-based blocking (prefix + first token)
    candidates |= text_blocking(source_pair_id)

    # Pass 2: Embedding-based blocking (pgvector ANN, K=20)
    candidates |= embedding_blocking(source_pair_id, k=20)

    return candidates

def embedding_blocking(source_pair_id: int, k: int = 20) -> set[tuple[int, int]]:
    """Use pgvector to find K nearest neighbors for each supplier"""
    # SQL: SELECT id, embedding <=> target_embedding AS distance
    #      FROM staged_suppliers WHERE source_id = :other_source
    #      ORDER BY embedding <=> target_embedding LIMIT :k
    ...
```

### Pattern 3: JSONB + Extracted Key Fields (Hybrid Storage)

**What:** Store the full raw CSV row as JSONB (preserving all 268-284 columns) alongside extracted, indexed key fields (name, normalized_name, short_name, country, currency, contact info). Matching operates on key fields; merge UI can access any field from JSONB.

**When to use:** When source schemas are wide, vary across sources, and may change over time. The JSONB column is a flexible escape hatch that preserves data fidelity without requiring 284-column tables.

**Trade-offs:**
- (+) No data loss — every CSV column is preserved
- (+) Schema changes don't require migrations for raw data
- (+) Key fields are indexed and fast to query for matching
- (-) JSONB queries are slower than native columns for bulk operations
- (-) Need to keep key fields in sync with JSONB (single source of truth is the mapping config)

**Example:**
```python
class StagedSupplier(Base):
    __tablename__ = "staged_suppliers"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("data_sources.id"))
    supplier_code: Mapped[str] = mapped_column(String(50), index=True)

    # Extracted key fields (indexed, used for matching)
    name: Mapped[str] = mapped_column(String(500))
    normalized_name: Mapped[str] = mapped_column(String(500), index=True)
    short_name: Mapped[Optional[str]] = mapped_column(String(200))
    country: Mapped[Optional[str]] = mapped_column(String(10))
    currency: Mapped[Optional[str]] = mapped_column(String(10))

    # Full raw row (all 268-284 columns)
    raw_data: Mapped[dict] = mapped_column(JSONB)

    # Embedding for semantic matching
    name_embedding: Mapped[Any] = mapped_column(Vector(384))

    # Lifecycle
    upload_batch_id: Mapped[int] = mapped_column(ForeignKey("upload_batches.id"))
    is_active: Mapped[bool] = mapped_column(default=True)  # False when superseded
```

### Pattern 4: Celery Task with WebSocket Notification

**What:** Long-running operations (ingestion, matching) run as Celery tasks. The task publishes progress via custom states. On completion, the task pushes a notification through Redis pub/sub. A FastAPI WebSocket endpoint subscribes to Redis and forwards notifications to connected browser clients.

**When to use:** For any operation taking >2 seconds (CSV parsing, embedding computation, matching pipeline). Users should know when their job is done without polling.

**Trade-offs:**
- (+) Non-blocking — UI stays responsive during long jobs
- (+) Progress tracking via Celery custom states
- (+) Real-time notification avoids polling overhead
- (-) WebSocket connection management adds complexity
- (-) Redis pub/sub is fire-and-forget (if client disconnects and reconnects, they miss messages — mitigate with a polling fallback)

### Pattern 5: Field-Level Provenance on Golden Records

**What:** Every field in a unified supplier record tracks: which source provided the value, who chose it, when, and optionally why. This is the "merge provenance" — the audit trail that makes the golden record trustworthy.

**When to use:** Always in human-in-the-loop merge systems. Without provenance, you can't explain why a golden record looks the way it does, and you can't undo mistakes.

**Trade-offs:**
- (+) Complete audit trail for compliance and debugging
- (+) Enables "undo" by reverting to alternative source values
- (+) Builds trust with reviewers — they can see the history
- (-) More storage per unified record (one provenance row per field per merge)
- (-) Merge UI must capture and persist reviewer choices per field

**Example:**
```python
class FieldProvenance(Base):
    __tablename__ = "field_provenance"

    id: Mapped[int] = mapped_column(primary_key=True)
    unified_supplier_id: Mapped[int] = mapped_column(ForeignKey("unified_suppliers.id"))
    field_name: Mapped[str] = mapped_column(String(100))
    field_value: Mapped[Optional[str]] = mapped_column(Text)
    source_id: Mapped[int] = mapped_column(ForeignKey("data_sources.id"))
    source_supplier_id: Mapped[int] = mapped_column(ForeignKey("staged_suppliers.id"))
    chosen_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    chosen_at: Mapped[datetime] = mapped_column(default=func.now())
```

## Data Flow

### Primary Data Flow: Upload to Golden Record

```
CSV File (semicolon-delimited, BOM, ~284 columns)
    │
    ▼
[1. Upload Router] ──POST /api/upload──▶ Save file, create UploadBatch
    │
    ▼
[2. Ingestion Task] (Celery async)
    │
    ├── Parse CSV (BOM strip, semicolon delimiter, quote handling)
    ├── Map columns (JSON config per source)
    ├── Normalize names (uppercase, strip legal suffixes, collapse spaces)
    ├── Compute embeddings (all-MiniLM-L6-v2, batch_size=64)
    └── Insert StagedSuppliers (key fields + JSONB + Vector)
    │
    ▼
[3. Matching Task] (Celery async, triggered after ingestion)
    │
    ├── Pass 1: Text blocking (name prefix + first token)
    ├── Pass 2: Embedding blocking (pgvector ANN, K=20)
    ├── Deduplicate candidate pairs
    ├── Score pairs (Jaro-Winkler, token Jaccard, cosine, short name, currency, contact)
    ├── Combine signals → composite score
    └── Cluster: connected components via union-find → MatchGroups
    │
    ▼
[4. Review Queue] (React UI)
    │
    ├── Browse match groups sorted by confidence
    ├── View match detail: side-by-side, signal breakdown, conflict highlights
    ├── Reviewer decision: MATCH (proceed to merge) or REJECT (not same supplier)
    └── For matches: field-by-field merge selection
    │
    ▼
[5. Merge Service]
    │
    ├── Create UnifiedSupplier from selected field values
    ├── Write FieldProvenance for each field
    └── Mark source StagedSuppliers as "merged"
    │
    ▼
[6. Unified Store]
    │
    └── Golden records browsable with provenance badges
```

### Re-Upload Flow

```
New CSV for existing source
    │
    ▼
[1. Upload Router] ──detect existing source──▶ Create new UploadBatch
    │
    ▼
[2. Ingestion Task]
    │
    ├── Mark old StagedSuppliers (same source) as is_active=False
    ├── Parse + insert new StagedSuppliers
    └── Invalidate stale MatchCandidates involving old records
    │
    ▼
[3. Re-matching] ──trigger new matching run for affected source pairs──▶
```

### WebSocket Notification Flow

```
Celery Worker                    Redis                     FastAPI              Browser
    │                              │                          │                    │
    │── task.update_state ────────▶│                          │                    │
    │   (PROGRESS/COMPLETE)        │                          │                    │
    │                              │                          │                    │
    │── PUBLISH job:complete ─────▶│                          │                    │
    │                              │──SUBSCRIBE──▶            │                    │
    │                              │              │           │                    │
    │                              │              └──message──▶│                    │
    │                              │                          │──ws.send_json()───▶│
    │                              │                          │                    │
```

### Key Data Flows

1. **Ingestion flow:** CSV → parse → map → normalize → embed → staged_suppliers table. Single Celery task, ~30-60 seconds for 3K suppliers on CPU.
2. **Matching flow:** staged_suppliers → blocking (text + embedding) → candidate_pairs → scoring → match_groups. Single Celery task, ~2-5 minutes for 5K suppliers cross-entity.
3. **Review flow:** match_groups → review_queue API → React UI → reviewer decision → merge_service → unified_suppliers + field_provenance. Synchronous HTTP, no Celery.
4. **Re-upload flow:** New CSV → deactivate old staged records → re-ingest → invalidate stale matches → re-match. Celery task chain.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| ~5K suppliers, 2 sources (current) | Single Celery worker, single PostgreSQL instance. HNSW index on embeddings. Everything fits in memory. No optimization needed. |
| ~20K suppliers, 5-10 sources | Multiple Celery workers (concurrency=4). pgvector HNSW index critical. Consider pre-computing blocking keys as materialized columns. Batch embedding computation. |
| ~100K+ suppliers | Partition staged_suppliers by source. Multiple Celery workers with task routing. Consider IVFFlat index (trains on data) instead of HNSW for faster index build. Incremental matching (only new records vs. existing). |

### Scaling Priorities

1. **First bottleneck: Embedding computation.** At 5K suppliers, all-MiniLM-L6-v2 on CPU takes ~5-10 seconds (batch_size=64). At 20K, this grows to ~30-40 seconds. Mitigation: only compute embeddings for new/changed records; cache embeddings in DB.
2. **Second bottleneck: Pairwise comparison.** With naive cross-join, 5K × 5K = 25M pairs. Two-pass blocking reduces this to ~50K-200K candidate pairs. At 20K suppliers across 5 sources, blocking efficiency becomes critical. Mitigation: tighter blocking keys, embedding ANN with lower K.
3. **Third bottleneck: Review throughput.** Not a technical bottleneck but an operational one. With 2-5 reviewers and potentially thousands of match candidates, the review queue UX (sorting, filtering, batch actions) determines how fast the team can process matches.

## Anti-Patterns

### Anti-Pattern 1: Monolithic Matching Function

**What people do:** Put blocking, comparison, scoring, and clustering into one giant function or Celery task.
**Why it's wrong:** Can't test scoring logic without running blocking first. Can't re-run clustering with different thresholds without re-computing all scores. Can't parallelize independent stages.
**Do this instead:** Separate into distinct service functions (blocking_service, comparison_service, clustering_service) called sequentially by a thin orchestrating task. Persist intermediate results (candidate pairs with scores) so you can re-cluster without re-scoring.

### Anti-Pattern 2: Storing Only Match Decisions, Not Scores

**What people do:** Store only "match" or "no match" for each candidate pair.
**Why it's wrong:** Loses the signal breakdown that helps reviewers make decisions. Can't retrain signal weights without historical scores. Can't adjust thresholds retroactively.
**Do this instead:** Store the full score vector (Jaro-Winkler score, Jaccard score, cosine similarity, each signal individually) alongside the composite score. The review UI displays these signal breakdowns.

### Anti-Pattern 3: Auto-Merging Without Review

**What people do:** Set a confidence threshold and auto-merge everything above it.
**Why it's wrong:** Even at 99% confidence, with 5K suppliers you'll have ~50 false positives that silently corrupt the golden database. For supplier master data, a bad merge (combining two different suppliers) is much worse than a missed merge.
**Do this instead:** All merges go through human review. Sort by confidence so reviewers process high-confidence (easy) decisions first. This is an explicit project requirement.

### Anti-Pattern 4: Embedding Model as Sole Matching Signal

**What people do:** Use only embedding cosine similarity for matching.
**Why it's wrong:** Embeddings capture semantic similarity but miss structured signals (same currency, same country, same contact person). Two suppliers with similar names but different countries may have high cosine similarity but be different entities.
**Do this instead:** Multi-signal scoring. Embeddings are one signal among many (Jaro-Winkler on name, token Jaccard, short name match, currency match, contact match). Combine with learned weights or logistic regression.

### Anti-Pattern 5: Tight Coupling Between Celery Tasks and DB Models

**What people do:** Import SQLAlchemy models directly in Celery tasks and run queries inline.
**Why it's wrong:** Celery workers run in separate processes. Session management becomes error-prone. Tasks become untestable without a database. ORM lazy-loading causes N+1 queries in worker context.
**Do this instead:** Tasks call service functions that accept a DB session. Services handle all DB interaction. Tasks manage session lifecycle (create session, call service, commit/rollback, close). Services are independently testable with mocked sessions.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Sage X3 | File export only (CSV) | No API integration — manual CSV export from Sage X3, upload to OneBase. Out of scope to write back. |
| sentence-transformers | Python library, in-process | Model loaded once at worker startup, reused across tasks. Pre-download during Docker build. ~80MB model. |
| pgvector | PostgreSQL extension | Enabled via `CREATE EXTENSION vector`. Use `pgvector/pgvector:pg16` Docker image. HNSW index for ANN queries. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Frontend ↔ API | REST (JSON) + WebSocket | REST for CRUD, WebSocket for real-time notifications. API versioned at `/api/v1/`. |
| API ↔ Celery | Task dispatch (Redis broker) | API calls `task.delay()`, gets task_id back. Frontend polls `/api/tasks/{id}` or receives WebSocket notification. |
| Celery ↔ PostgreSQL | SQLAlchemy sessions | Each task creates its own session. Long-running tasks should commit in batches (e.g., every 500 records). |
| Celery ↔ Redis | Broker + result backend + pub/sub | Redis serves triple duty: task broker, result backend, and pub/sub for WebSocket notifications. Single Redis instance is fine at this scale. |
| API ↔ PostgreSQL | SQLAlchemy async sessions (or sync) | FastAPI endpoints use dependency-injected sessions. Async sessions optional — sync is fine for this scale and simpler to debug. |

## Database Schema Overview

### Core Tables and Relationships

```
data_sources           upload_batches          staged_suppliers
┌──────────────┐       ┌──────────────┐        ┌──────────────────┐
│ id           │◄──┐   │ id           │◄──┐    │ id               │
│ name         │   │   │ source_id    │───┘    │ source_id ───────│──►data_sources
│ entity_code  │   │   │ filename     │   ┌───│ upload_batch_id  │──►upload_batches
│ column_mapping│   │   │ uploaded_at  │   │    │ supplier_code    │
│ (JSONB)      │   │   │ uploaded_by  │   │    │ name             │
└──────────────┘   │   │ status       │   │    │ normalized_name  │
                   │   └──────────────┘   │    │ raw_data (JSONB) │
                   │                      │    │ name_embedding   │
                   │                      │    │ (Vector(384))    │
                   │                      │    │ is_active        │
                   │                      │    └──────────────────┘
                   │
match_candidates                          match_groups
┌──────────────────┐                      ┌──────────────────┐
│ id               │                      │ id               │
│ supplier_a_id ───│──►staged_suppliers   │ status           │
│ supplier_b_id ───│──►staged_suppliers   │ (pending/reviewed│
│ composite_score  │                      │  /merged/rejected)│
│ jw_score         │                      │ reviewed_by      │
│ jaccard_score    │                      │ reviewed_at      │
│ cosine_score     │                      └────────┬─────────┘
│ currency_match   │                               │
│ contact_match    │                               │
│ group_id ────────│──►match_groups                │
│ status           │                               │
└──────────────────┘                               │
                                                   │
unified_suppliers                    field_provenance
┌──────────────────┐                 ┌──────────────────┐
│ id               │◄────────────────│ unified_supplier_│
│ canonical_name   │                 │   id             │
│ merged_from      │                 │ field_name       │
│ (array of staged │                 │ field_value      │
│  supplier IDs)   │                 │ source_id ───────│──►data_sources
│ match_group_id ──│──►match_groups  │ source_supplier_ │
│ created_by       │                 │   id ────────────│──►staged_suppliers
│ created_at       │                 │ chosen_by ───────│──►users
└──────────────────┘                 │ chosen_at        │
                                     └──────────────────┘
```

### Key Indexes

| Table | Index | Type | Purpose |
|-------|-------|------|---------|
| staged_suppliers | normalized_name | B-tree | Text-based blocking (prefix match) |
| staged_suppliers | name_embedding | HNSW (vector_cosine_ops) | Embedding-based ANN blocking |
| staged_suppliers | (source_id, is_active) | B-tree composite | Filter active suppliers by source |
| match_candidates | (group_id, status) | B-tree composite | Review queue queries |
| match_candidates | composite_score | B-tree | Sort by confidence |
| unified_suppliers | canonical_name | B-tree | Browse/search unified records |

## Suggested Build Order

The components have natural dependencies that dictate build order:

### Phase 1: Foundation (must come first)

**Build:** Database schema + models, project skeleton, Docker Compose, basic FastAPI app

**Why first:** Everything depends on the data layer. You can't ingest without tables, can't match without staged data, can't review without match results.

**Dependencies satisfied:** None (this is the base)

### Phase 2: Ingestion Pipeline

**Build:** CSV parsing, column mapping, name normalization, embedding computation, staging table population

**Why second:** You need data in the system before you can match it. The ingestion pipeline is the entry point for all data.

**Dependencies satisfied:** Phase 1 (database, models)

### Phase 3: Matching Engine

**Build:** Two-pass blocking, multi-signal comparison, scoring, connected component clustering

**Why third:** Matching operates on staged data (Phase 2). This is the core algorithmic component — it produces the match candidates that drive the entire review workflow.

**Dependencies satisfied:** Phase 2 (staged data with embeddings)

### Phase 4: Review UI + Merge

**Build:** Review queue API, match detail view, field-by-field merge, provenance tracking, unified record creation

**Why fourth:** Review is the human-in-the-loop step that depends on match candidates (Phase 3). The merge engine produces the final golden records.

**Dependencies satisfied:** Phase 3 (match candidates and groups)

### Phase 5: Dashboard + Polish

**Build:** Dashboard with stats, upload management, source configuration, re-upload lifecycle, WebSocket notifications, auth

**Why last:** These features enhance usability but aren't on the critical path. The core value (ingest → match → review → merge) works without them.

**Dependencies satisfied:** Phases 1-4 (all core components)

### Dependency Graph

```
Phase 1: Foundation
    │
    ▼
Phase 2: Ingestion
    │
    ▼
Phase 3: Matching
    │
    ▼
Phase 4: Review + Merge
    │
    ▼
Phase 5: Dashboard + Polish
```

Each phase is strictly dependent on the previous one. There is minimal opportunity for parallelism between phases because data flows linearly through the pipeline. Within each phase, frontend and backend work can be parallelized (e.g., build the review API and review UI simultaneously in Phase 4).

## Sources

- **Resolvi Reference Architecture** (Olar, 2025) — "A Reference Architecture for Extensible, Scalable and Interoperable Entity Resolution" (arxiv.org/html/2503.08087v3). Comprehensive reference architecture analyzing JedAI, Splink, Dedupe, Duke, FAMER, DeepMatcher, d-blink. **HIGH confidence** — peer-reviewed, code-analysis-based, March 2025.
- **FastAPI Bigger Applications** — Official docs on project structure with routers, dependencies (fastapi.tiangolo.com/tutorial/bigger-applications). **HIGH confidence** — Context7 verified.
- **Celery Canvas** — Official docs on task chains, groups, chords, custom states (docs.celeryq.dev/en/stable/userguide/canvas). **HIGH confidence** — Context7 verified.
- **pgvector-python** — Official docs on SQLAlchemy integration, HNSW/IVFFlat indexes, vector operations (github.com/pgvector/pgvector-python). **HIGH confidence** — Context7 verified.
- **recordlinkage** — Python toolkit demonstrating standard ER pipeline: index → compare → classify (github.com/j535d165/recordlinkage). **HIGH confidence** — Context7 verified.
- **sentence-transformers** — Official docs on batch encoding, model loading, embedding computation (huggingface/sentence-transformers). **HIGH confidence** — Context7 verified.

---
*Architecture research for: Enterprise Supplier Data Unification Platform (OneBase)*
*Researched: 2026-03-13*
