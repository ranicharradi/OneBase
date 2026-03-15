# Project Research Summary

**Project:** OneBase
**Domain:** Enterprise Supplier Data Unification / Record Linkage Platform
**Researched:** 2026-03-13
**Confidence:** HIGH

## Executive Summary

OneBase is an **enterprise supplier deduplication platform** — a batch entity resolution system with a human-in-the-loop review workflow. This is a well-understood domain: the Entity Resolution (ER) pipeline model has been validated by every major system (JedAI, Splink, Dedupe, Duke) and formalized in the Resolvi reference architecture (2025). The recommended approach is a **custom matching pipeline** (not Splink or recordlinkage — wrong scale and deployment model) using Python/FastAPI for the API, Celery for async matching jobs, PostgreSQL+pgvector for unified storage and vector search, and a React SPA for the review UI. The stack is mature, all versions are current-stable, and the architecture follows canonical patterns with no exotic dependencies.

The key differentiators over off-the-shelf tools are: (1) **semantic embedding matching** via all-MiniLM-L6-v2, which catches name matches that pure string similarity misses — genuinely rare in on-prem tools; (2) **two-pass blocking** (text + embedding ANN) for superior recall; (3) **signal explainability** showing reviewers exactly why two records matched; and (4) a **feedback loop** where reviewer decisions retrain signal weights via logistic regression. The core workflow is linear — ingest → normalize → embed → block → match → review → merge → golden record — with natural phase boundaries at each stage.

The primary risks are: **transitive closure contamination** (one false positive chains unrelated suppliers into a monster cluster — must cap cluster size and require internal density), **blocking recall loss** (overly restrictive blocking silently drops true matches — mitigate with K=30-50 for ANN and measuring pair completeness), and **name normalization data destruction** (aggressive normalization can make different legal entities look identical — preserve raw names, normalize in layers, extract legal suffixes as separate fields). All seven identified critical pitfalls have clear prevention strategies and specific phase assignments. The re-upload lifecycle is the most architecturally complex pitfall, spanning ingestion, matching, and review phases — it needs upfront state machine design.

## Key Findings

### Recommended Stack

The stack splits cleanly into backend (Python 3.12, FastAPI, SQLAlchemy 2.0, Celery+Redis, PostgreSQL 16+pgvector), frontend (React 19, Vite 6, TypeScript 5.7, TanStack Query/Table, Tailwind CSS 4), and ML (sentence-transformers 5.3, rapidfuzz 3.14, scikit-learn 1.7). All versions are latest-stable with verified compatibility. Deployment is Docker Compose with 5 services (api, worker, frontend, postgres, redis).

**Core technologies:**
- **FastAPI + Pydantic v2**: Async API with WebSocket support, auto-generated OpenAPI docs, 5-17x faster validation via Rust core
- **PostgreSQL 16 + pgvector 0.8**: Single database for supplier data, embeddings, match results, and provenance — HNSW index for ANN search, no separate vector DB needed
- **Celery + Redis**: Distributed task queue for CPU-intensive matching jobs (embedding generation, blocking, pairwise comparison)
- **sentence-transformers + rapidfuzz**: Semantic embeddings (384-dim, CPU-friendly) + string similarity (10-100x faster than thefuzz, MIT licensed)
- **React 19 + TanStack Query/Table**: Data-heavy review UI with server state management and headless table library for enterprise-grade sorting/filtering
- **Custom matching pipeline** (over Splink/recordlinkage): Full control over review queue, provenance, and feedback loop; ~5K suppliers don't need distributed compute

**Critical version constraints:**
- FastAPI 0.115+ requires Pydantic v2 (not v1)
- sentence-transformers 5.x requires Python 3.10+
- Use `pgvector/pgvector:pg16` Docker image (pre-built with extension)
- Use rapidfuzz (never thefuzz — GPL contamination, 10-100x slower)

### Expected Features

**Must have (table stakes):**
- CSV ingestion with encoding handling (BOM, semicolons, Windows-1252)
- Configurable column mappings per data source (JSON-based)
- Name normalization pipeline (uppercase, legal suffix removal, whitespace collapse)
- Multi-signal matching engine (Jaro-Winkler, token Jaccard, embedding cosine, domain signals)
- Two-pass blocking (text prefix + embedding ANN)
- Human review queue sorted by confidence with filtering
- Side-by-side match comparison with signal breakdown
- Field-by-field merge with winner selection per conflicting field
- Golden record / unified supplier database with provenance
- Merge audit trail (who, when, what values, which sources)
- Dashboard with progress stats
- Basic authentication (username/password, 2-5 users)
- Transitive match group detection (connected components)

**Should have (differentiators):**
- Semantic embedding matching (all-MiniLM-L6-v2) — rare in on-prem tools
- Signal explainability on match detail — builds reviewer trust
- Feedback loop / active learning — system improves from reviewer decisions
- Re-upload lifecycle management — handles periodic re-exports
- Singleton promotion — ensures 100% supplier coverage
- WebSocket real-time job notifications

**Defer (v2+):**
- Feedback loop (needs hundreds of accumulated reviews first)
- Re-upload lifecycle (first pass is one-shot dedup)
- Export functionality (CSV dump can be added easily later)
- WebSocket notifications (polling/manual refresh works initially)
- Singleton promotion (can be handled manually at first)

**Anti-features (explicitly do NOT build):**
- Auto-merge without human confirmation
- Write-back to Sage X3
- RBAC (2-5 equal users don't need roles)
- Scheduled/automated imports
- Mobile app
- Third-party data enrichment
- Multi-domain MDM
- GPU/heavy ML infrastructure

### Architecture Approach

The architecture follows the **pipeline-stage ER model** with four clean layers: Presentation (React SPA), API (FastAPI routers → services), Async Task (Celery workers), and Data (PostgreSQL+pgvector). Long-running operations run as Celery tasks with WebSocket completion notifications. Data storage uses a **hybrid JSONB + extracted key fields** pattern: full raw CSV rows preserved as JSONB (~284 columns), with indexed key fields (name, normalized_name, currency, country) extracted for matching. Field-level provenance tracks every merge decision as an immutable event.

**Major components:**
1. **Ingestion Pipeline** — Parse CSV, map columns, normalize names, compute embeddings, populate staging
2. **Matching Engine** — Two-pass blocking, multi-signal comparison, composite scoring, connected component clustering
3. **Review Queue + Merge Engine** — Human-in-the-loop review UI, field-by-field merge, golden record creation with provenance
4. **Unified Store** — Golden supplier records with field-level provenance, browsable and exportable
5. **Notification Service** — WebSocket push via Redis pub/sub for async job completion
6. **Source Manager** — Data source CRUD, column mapping configuration, upload lifecycle

### Critical Pitfalls

1. **Transitive closure contamination** — Cap cluster size at 10-15; require minimum internal density; display match graph to reviewers. Must be built into clustering from day one (Phase 2).
2. **Blocking recall loss** — Use K=30-50 for embedding ANN (not K=20); set pgvector `hnsw.ef_search=100-200`; measure pair completeness on confirmed matches. Invisible problem — missed matches never appear in queue.
3. **Name normalization data destruction** — Store both raw and normalized forms; normalize in layers (case → legal suffixes → transliteration); extract legal form as separate field. Must be correct in Phase 1.
4. **Reviewer fatigue/inconsistency** — Tier the review queue (quick-confirm for >0.95, deep review for 0.6-0.85); keyboard shortcuts; session limits; track inter-reviewer agreement. Critical UX decisions in Phase 3.
5. **Re-upload lifecycle corruption** — Design record lifecycle state machine upfront; never mutate in-place; cascade invalidation carefully; make re-upload idempotent. Spans Phases 1-3.
6. **Embedding model limitations** — all-MiniLM-L6-v2 is English-sentence-trained, not ideal for short French/German company names. Treat embeddings as ONE signal among many; test on actual data before committing to weights.
7. **Shallow provenance** — Design as event log, not just current state; support merge undo; track normalization provenance separately. Must be in data model from Phase 1.

## Implications for Roadmap

Based on research, the pipeline has strict linear dependencies. Each phase produces the input for the next. Suggested 5-phase structure:

### Phase 1: Foundation + Data Model
**Rationale:** Everything depends on the data layer. Database schema, project skeleton, Docker Compose, and core models must come first. Getting the data model right — especially the lifecycle state machine and provenance schema — prevents the costliest pitfalls.
**Delivers:** Running Docker environment (api, worker, frontend, postgres, redis), database schema with all tables and indexes, SQLAlchemy models, Alembic migrations, basic FastAPI app skeleton, Pydantic schemas.
**Addresses:** Data source management, column mapping config, auth user model.
**Avoids:** Shallow provenance (design event-log provenance from start); re-upload lifecycle corruption (design state machine upfront); normalization data loss (schema includes both raw and normalized columns).
**Stack:** PostgreSQL 16 + pgvector, SQLAlchemy 2.0 + Alembic, FastAPI skeleton, Docker Compose, Redis.

### Phase 2: Ingestion Pipeline
**Rationale:** You need data in the system before you can match it. Ingestion is the entry point. Normalization quality directly determines matching quality — getting this wrong is expensive to fix.
**Delivers:** CSV upload endpoint, BOM/encoding handling, semicolon delimiter support, column mapping engine, name normalization (layered: case → legal suffixes → transliteration), embedding computation (batch all-MiniLM-L6-v2), staging table population with JSONB + key fields.
**Addresses:** CSV ingestion, configurable column mappings, name normalization pipeline, embedding generation.
**Avoids:** Normalization data destruction (layered normalization, preserve raw); encoding failures (utf-8-sig, charset detection); CSV formula injection (strip formula-like content).
**Stack:** sentence-transformers, Celery task for async ingestion, python-multipart, chardet.

### Phase 3: Matching Engine
**Rationale:** Matching operates on staged data from Phase 2. This is the core algorithmic component and the hardest to get right. Two-pass blocking, multi-signal scoring, and connected component clustering must all work correctly together.
**Delivers:** Text-based blocking (prefix + first token), embedding-based blocking (pgvector ANN, K=30-50), multi-signal pairwise comparison (Jaro-Winkler, token Jaccard, embedding cosine, short name, currency, contact), composite scoring, connected component clustering with size caps, match group creation.
**Addresses:** Blocking/candidate generation, multi-signal matching engine, confidence scoring, transitive match groups.
**Avoids:** Transitive closure contamination (cluster size cap, internal density); blocking recall loss (wide K, high ef_search, pair completeness measurement); embedding over-indexing (embeddings as one signal among many); monolithic matching function anti-pattern (separate service functions for each stage).
**Stack:** rapidfuzz, pgvector ANN queries, scikit-learn (scoring), networkx (connected components), Celery task with progress states.

### Phase 4: Review UI + Merge
**Rationale:** Review is the human-in-the-loop step that depends on match candidates from Phase 3. The review queue, side-by-side comparison, and merge engine produce the final golden records — this is where the product delivers its core value.
**Delivers:** Review queue API with pagination/filtering/sorting, match detail view with side-by-side comparison, signal breakdown display, field-by-field merge with winner selection, golden record creation with field-level provenance, unified supplier browse view, keyboard shortcuts for review efficiency.
**Addresses:** Human review queue, side-by-side comparison, signal explainability, field-by-field merge, golden record creation, merge provenance/audit trail, unified supplier browse.
**Avoids:** Reviewer fatigue (tiered queue, session limits, keyboard shortcuts, progress indicators); auto-merge anti-pattern (all merges human-confirmed); showing all 200+ columns (conflicting fields only, expandable); no undo (soft-merge with undo support).
**Stack:** React 19 + TanStack Query/Table, Tailwind CSS 4, FastAPI review/merge routers.

### Phase 5: Dashboard, Polish + Operations
**Rationale:** These features enhance usability and operational readiness but aren't on the critical path. The core value loop (ingest → match → review → merge) works without them.
**Delivers:** Dashboard with upload/match/review/unified stats, data source management UI, basic auth (login, password hashing, session tokens), WebSocket notifications for job completion, re-upload lifecycle (supersession, stale candidate invalidation), singleton promotion, export of unified supplier database.
**Addresses:** Dashboard, basic auth, data source management, WebSocket notifications, re-upload lifecycle, singleton promotion, export.
**Avoids:** Re-upload state corruption (tested lifecycle state machine); WebSocket without auth (authenticated connections only); Docker persistence issues (PostgreSQL volume mounts).
**Stack:** WebSocket (FastAPI + Redis pub/sub), passlib+bcrypt, PyJWT.

### Phase Ordering Rationale

- **Strictly linear dependencies:** Data model → ingested data → match candidates → review decisions → golden records. Each phase produces the input for the next. There is no shortcut.
- **Risk-first ordering:** The data model (Phase 1) and normalization (Phase 2) are where the costliest mistakes happen. Provenance schema and normalization layers can't be retrofitted.
- **Core value before polish:** Phases 1-4 deliver the complete dedup workflow. Phase 5 adds operational features that aren't blocking for initial use.
- **Frontend/backend parallelism within phases:** Within Phase 4 especially, the review API and review UI can be built simultaneously by different developers.
- **Deferral of feedback loop:** Active learning requires hundreds of accumulated reviewer decisions. It's correctly deferred beyond MVP but the data model should support it from Phase 1 (store full score vectors on match candidates).

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (Matching Engine):** Most algorithmically complex — blocking strategy tuning, scoring weight calibration, cluster coherence thresholds all need experimentation with real data. Consider `/gsd-research-phase` for optimal blocking parameters.
- **Phase 4 (Review UI):** The review UX is where the product succeeds or fails. Side-by-side comparison layout, keyboard shortcuts, tiered review flow need UX research. The `frontend-design` skill should be used for the review interface.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation):** Well-documented — FastAPI project structure, SQLAlchemy models, Docker Compose, Alembic migrations are all cookbook patterns.
- **Phase 2 (Ingestion):** CSV parsing, column mapping, name normalization are straightforward. sentence-transformers `encode()` API is clean. Standard Celery task.
- **Phase 5 (Dashboard + Polish):** Dashboard is read-only stats. Auth is basic. WebSocket notification is documented pattern. No novel complexity.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified on PyPI/npm (Mar 2026). Compatibility matrix confirmed. Every recommendation backed by Context7 official docs. |
| Features | HIGH | Feature landscape validated against 10+ commercial MDM products (Profisee, SAP MDG, Reltio, Informatica, DataGroomr, WinPure, DataMatch). Table stakes and anti-features are clear. |
| Architecture | HIGH | ER pipeline model confirmed by Resolvi reference architecture (peer-reviewed, 2025) and 6+ open-source ER systems. Project structure follows FastAPI official patterns. |
| Pitfalls | HIGH | 7 critical pitfalls identified from academic literature (transitive closure), enterprise whitepapers (SAP dedup guidelines), and domain-specific analysis (embedding model limitations). Recovery strategies included. |

**Overall confidence:** HIGH

### Gaps to Address

- **Embedding model effectiveness on French/German company names:** all-MiniLM-L6-v2 is English-trained. Need to test on actual EOT/TTEI supplier data before committing to embedding signal weight. If embeddings add no value for this data, reduce weight and rely on string similarity + domain signals.
- **Optimal blocking parameters:** K=20 vs K=30 vs K=50 for embedding ANN, and `ef_search` tuning, should be determined empirically with real data during Phase 3. Start wide (K=50, ef_search=200) and tighten if performance is an issue.
- **Scoring weight calibration:** Initial signal weights will be heuristic. Need ~200+ reviewer decisions before logistic regression retraining is meaningful. Plan for manual weight tuning during Phase 3, automated retraining in future phase.
- **Multi-way merge UX:** Merging 3+ suppliers into one golden record (not just pairwise) needs UX design. Most documentation covers pairwise merge; multi-way merge in the review UI is less well-documented.
- **Sage X3 CSV format specifics:** Exact delimiter, encoding, quoting, and column header formats vary by Sage X3 version and export configuration. Need sample files from each entity (EOT, TTEI) during Phase 2 to validate parser.

## Sources

### Primary (HIGH confidence)
- `/fastapi/fastapi` (Context7) — API framework, WebSocket, project structure
- `/websites/sqlalchemy_en_21` (Context7) — SQLAlchemy 2.0 async, model patterns
- `/websites/celeryq_dev_en_stable` (Context7) — Celery Redis broker, task chains, custom states
- `/websites/sbert_net` (Context7) — sentence-transformers, all-MiniLM-L6-v2, batch encoding
- `/pgvector/pgvector` (Context7) — HNSW indexes, cosine distance, filtered queries
- `/j535d165/recordlinkage` (Context7) — ER pipeline patterns, blocking, comparison
- Resolvi Reference Architecture (Olar, 2025) — arxiv.org/html/2503.08087v3
- SAP Community — enterprise dedup guidelines, 100 reviews/person/week benchmark
- Journal of Computer Science and Technology Studies (2025) — transitive closure violations
- ACM JDIQ (2025) — graph metrics for cluster repair
- PyPI/npm version verification for all recommended packages (Mar 2026)

### Secondary (MEDIUM confidence)
- Profisee, SAP MDG, Reltio, Informatica, Verdantis — commercial MDM feature landscape
- DataGroomr — ML learning from user merge actions (feedback loop reference)
- Semantic Visions (Jan 2026) — hybrid matching, threshold tuning
- Data Doctrine (Sep 2025) — golden record survivorship pitfalls
- Medium — company name normalization, legal suffix handling

### Tertiary (LOW confidence)
- Cloudingo — unmerge/undo feature (single vendor, but validates the need)
- similarity-api.com — rapidfuzz vs thefuzz benchmarks (third-party, but consistent with other reports)

---
*Research completed: 2026-03-13*
*Ready for roadmap: yes*

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

# Feature Landscape

**Domain:** Enterprise supplier data unification / record linkage / deduplication
**Researched:** 2026-03-13

## Table Stakes

Features users expect. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| CSV/file ingestion with format handling | Every dedup tool starts with data import; users have messy CSV/Excel files with encoding quirks (BOM, delimiters, quoting) | Med | Must handle semicolon-delimited, BOM stripping, whitespace trimming. Sage X3 exports are the primary source. |
| Configurable column mappings | Source schemas vary across ERP entities; rigid mappings break on the next import | Med | JSON-based mapping configs per data source. Essential for multi-source unification. |
| Name normalization pipeline | Supplier names vary wildly (legal suffixes, casing, abbreviations, whitespace). Raw names produce garbage matches | Med | Uppercase, remove legal suffixes (SARL, SAS, GmbH, LLC), collapse whitespace, strip punctuation. Industry-standard preprocessing. |
| Multi-signal matching engine | Single-algorithm matching (e.g., Jaro-Winkler alone) produces too many false positives/negatives. Every credible tool uses multiple signals | High | Combine string similarity (Jaro-Winkler, token Jaccard), semantic (embedding cosine), domain signals (currency, contact, short name). This is the core differentiator in quality. |
| Blocking / candidate generation | Without blocking, N^2 comparisons are infeasible even at 5K records. Every record linkage system uses blocking | Med | Two-pass blocking (text-based prefix + embedding-based ANN) is above-average. Industry standard is at least one blocking pass. |
| Confidence scoring on match candidates | Reviewers need to prioritize their work. Every commercial dedup tool shows a confidence/similarity score | Med | Composite score from multiple signals. Must be interpretable (not just a black-box number). |
| Human review queue | All credible MDM/dedup products support human-in-the-loop review. Auto-merge without review is a liability for master data | Med | Sorted by confidence, filterable by source pair and confidence range. This is the primary reviewer workflow. |
| Side-by-side match comparison | Reviewers can't decide without seeing both records. Every MDM stewardship UI shows candidates side-by-side | Med | Signal breakdown (why did these match?), field-level conflict highlighting. Profisee, WinPure, DataMatch all do this. |
| Field-by-field merge with winner selection | "Take address from Source A, phone from Source B." Attribute-level survivorship is the industry standard (Profisee, SAP MDG, Reltio all support this) | Med | Reviewer picks winner for each conflicting field. Non-conflicting fields carry through automatically. |
| Golden record / unified supplier database | The entire point. A single source of truth with one record per real-world supplier entity | Med | Must track which source records contributed to each golden record. |
| Merge provenance / audit trail | Enterprise tools require tracking who merged what, when, and which values were chosen. Compliance requirement in MDM (SAP MDG, Profisee, Informatica all emphasize this) | Med | Field-level provenance: source entity, reviewer, timestamp, original values. Non-negotiable for data governance. |
| Dashboard with progress stats | Reviewers and managers need to know: how many records ingested, how many matches found, how many reviewed, how many remaining | Low | Upload status, match stats, review progress, recent activity. |
| Basic authentication | On-prem internal tool needs at minimum username/password auth. Not sophisticated, but required | Low | Local accounts, password hashing. No external auth providers needed for 2-5 users. |
| Transitive match group detection | If A matches B and B matches C, all three should be in the same review group. Connected components algorithm. Standard in record linkage | Med | Prevents orphaned matches and inconsistent merge decisions across related records. |

## Differentiators

Features that set product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Semantic embedding matching (all-MiniLM-L6-v2) | Goes beyond string similarity — catches semantic matches like "Compagnie Industrielle" vs "Industrial Company" that Jaro-Winkler misses entirely | Med | CPU-lightweight (80MB model). 384-dim embeddings stored in pgvector. This is genuinely rare in on-prem tools; most commercial products only offer fuzzy string matching. |
| Two-pass blocking (text + embedding ANN) | Text blocking catches obvious prefix matches fast; embedding blocking catches non-obvious semantic matches. Most tools use only one blocking strategy | Med | pgvector ANN search (K=20) as second pass. Significantly reduces false negatives vs. single-pass blocking. |
| Signal explainability on match detail | Show exactly why two records matched: "Jaro-Winkler: 0.92, Token Jaccard: 0.85, Embedding cosine: 0.78, Same currency: yes." Most tools show just a score | Med | Builds reviewer trust. Lets reviewers spot when the algorithm is wrong and why. Profisee mentions explainability but most tools are black-box. |
| Feedback loop / active learning | Reviewer decisions retrain signal weights via logistic regression. The system gets smarter over time. Very few on-prem tools offer this | High | Requires accumulating enough labeled decisions to retrain. Powerful differentiator — DataGroomr (Salesforce) highlights ML learning from user actions as a key feature. |
| Re-upload lifecycle management | New CSV exports supersede old staged records and invalidate stale match candidates. Handles the reality that supplier data is re-exported periodically | Med | Most tools treat ingestion as one-shot. This handles the ongoing operational lifecycle where ERP data is re-extracted monthly/quarterly. |
| Singleton promotion | Suppliers with no matches can be explicitly accepted into the unified DB (not just left in limbo). Ensures 100% coverage of the unified database | Low | Small feature but important for completeness. Prevents "forgotten" records that never get reviewed. |
| WebSocket real-time notifications | Matching jobs can take minutes on 5K records. Real-time notification when complete avoids polling/refreshing | Low | Nice UX touch. Most batch tools just show a "check back later" message. |
| Export of unified supplier database | Reviewers need to get the cleaned data out — CSV/Excel export of golden records with provenance metadata | Low | Not in current scope (no write-back to Sage X3), but exporting the unified DB itself is essential for the data to be useful. |
| Match candidate filtering by source pair | When you have 3+ entities, being able to filter "show me only EOT vs TTEI matches" is essential for organized review | Low | Helps reviewers work systematically through one entity pair at a time rather than a mixed queue. |
| Data source management UI | Add/edit data source configurations (name, description, column mappings) without touching config files | Low | Admin-level feature. Makes the system self-service for adding future entities. |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Auto-merge (no human confirmation) | Data accuracy is paramount. OneBase's core value is human-reviewed merges. Auto-merge is a liability — one bad merge contaminates the golden record and is hard to undo. Even Profisee keeps "human in the loop" for inconclusive results | Keep all merges human-confirmed. The review queue IS the product |
| Write-back to Sage X3 | ERP write-back is enormously complex (validation rules, approval workflows, ERP-specific APIs). OneBase is a unification tool, not an ERP integration platform. The unified DB is the source of truth | Export unified data as CSV/Excel. Let ERP admins handle import if needed |
| Role-based access control (RBAC) | 2-5 equal reviewers don't need roles. RBAC adds complexity with zero value at this team size. If needed later, it's additive, not foundational | All users are equal reviewers. Basic auth with audit trail is sufficient |
| Scheduled/automated imports | On-demand upload is simpler and safer. Automated imports risk ingesting bad data without anyone noticing. At 2-5 users doing periodic dedup, on-demand is fine | Manual upload with clear status indicators. Users control when new data enters |
| Mobile app | This is a data-heavy review workflow with side-by-side comparison, field-level merge, and signal breakdowns. Mobile is the wrong form factor | Desktop web only. Optimize for large screens with dense data tables |
| Third-party data enrichment (D&B, EcoVadis) | External data providers add cost, API complexity, and compliance concerns. The problem being solved is cross-entity deduplication of known data, not data enrichment | Focus on matching what you already have. Enrichment can be a future add-on |
| Multi-domain MDM (customer, product, etc.) | OneBase solves supplier deduplication. Multi-domain adds massive scope creep. The data model, UI, and matching logic should be supplier-focused | Keep the domain narrow. The architecture can generalize later if needed |
| GPU/heavy ML infrastructure | On-prem deployment constraint. GPU adds hardware cost, Docker complexity, and deployment friction. all-MiniLM-L6-v2 runs fine on CPU | CPU-only, lightweight models. Optimize blocking and batching instead |
| Complex approval workflows | Workflow engines (multi-step approvals, escalations, SLA tracking) are enterprise MDM bloat. With 2-5 users, a simple review queue is sufficient | Single-step review: see match → decide (merge/reject) → done |
| Real-time/streaming deduplication | Batch processing is the right model for periodic CSV exports. Real-time adds architectural complexity (event streams, change data capture) with no benefit for the use case | Batch upload → batch matching → queue review. Simple and correct |

## Feature Dependencies

```
CSV Ingestion → Column Mappings → Name Normalization → Staging Tables
                                                            ↓
                                                    Embedding Generation
                                                            ↓
Blocking (text-based) ──────────────────────────┐
Blocking (embedding ANN) ──────────────────────┤
                                                ├→ Match Scoring → Match Groups
Multi-signal Comparison ───────────────────────┘      (confidence)   (transitive)
                                                            ↓
                                                    Review Queue
                                                            ↓
                                              Side-by-side Comparison
                                                            ↓
                                              Field-by-field Merge
                                                            ↓
                                              Golden Record + Provenance
                                                            ↓
                                              Unified Supplier Browse/Export

Dashboard ← (reads from all stages: uploads, staging, matches, reviews, unified)

Feedback Loop ← (reads from reviewer decisions, retrains signal weights)

Singleton Promotion ← (suppliers with 0 match candidates → direct to unified DB)

Re-upload Lifecycle ← (new ingestion invalidates stale staging + match records)

Auth / Audit Trail ← (wraps all user actions)
```

**Critical path:** Ingestion → Normalization → Embedding → Blocking → Matching → Review Queue → Merge → Golden Record

**Independent tracks that can parallelize:**
- Dashboard (reads data, no writes)
- Auth system (orthogonal to data pipeline)
- Data source management UI (admin config)
- WebSocket notifications (orthogonal to matching logic)

## MVP Recommendation

Prioritize (in order of build dependency):

1. **CSV ingestion + column mappings + normalization** — Can't do anything without getting data in cleanly
2. **Embedding generation + staging** — Foundation for semantic matching
3. **Blocking + multi-signal matching + confidence scoring** — The matching engine is the core product
4. **Transitive match groups** — Essential for correct merge behavior
5. **Review queue with filtering** — Primary user-facing workflow
6. **Side-by-side comparison with signal breakdown** — Where reviewers spend their time
7. **Field-by-field merge with provenance** — How golden records get created
8. **Unified supplier browse** — See the output of your work
9. **Dashboard** — Progress tracking and operational visibility
10. **Basic auth** — Security baseline

Defer to later:
- **Feedback loop / active learning**: Needs accumulated reviewer decisions first (hundreds of reviews minimum). Build after core workflow is stable.
- **Re-upload lifecycle**: First pass is one-shot dedup of current exports. Lifecycle management matters for ongoing operations.
- **Export functionality**: Golden records exist in DB; export can be a simple CSV dump added later.
- **WebSocket notifications**: Nice UX but not blocking. Polling or manual refresh works initially.
- **Singleton promotion**: Can be handled manually at first (mark non-matching suppliers as reviewed).

## Sources

- Profisee MDM — Matching & survivorship features, stewardship workflow, golden record management (https://profisee.com/solutions/initiatives/matching-and-survivorship/, https://profisee.com/blog/mdm-survivorship/) — MEDIUM confidence (vendor documentation)
- Verdantis — Supplier MDM platform comparison, AI agents for dedup/enrichment/governance (https://www.verdantis.com/supplier-master-data-platforms/) — MEDIUM confidence (vendor documentation)
- Informatica — Supplier MDM lifecycle (onboarding, deactivation, governance workflows) (https://www.informatica.com/resources/articles/supplier-master-data-management.html) — MEDIUM confidence (vendor documentation)
- SAP MDG — Duplicate detection, validation rules, audit trail, third-party integrations — MEDIUM confidence (referenced in Verdantis comparison)
- Reltio — Cloud-native MDM, unified supplier profiles, prebuilt supplier velocity packs — MEDIUM confidence (vendor documentation)
- Kodiak Hub — SRM with AI-powered supplier profiles, risk/performance scoring — MEDIUM confidence (vendor documentation)
- DataGroomr — ML learning from user merge actions for Salesforce dedup (https://datagroomr.com/) — MEDIUM confidence (vendor marketing)
- Cloudingo — Unmerge/undo feature for Salesforce dedup (https://cloudingo.com/) — LOW confidence (single vendor feature)
- Data Ladder / DataMatch Enterprise — Visual matching, survivorship rules, merge/purge (https://dataladder.com/) — MEDIUM confidence (vendor documentation)
- WinPure — AI-powered matching, entity resolution, cultural name variations (https://winpure.com/) — MEDIUM confidence (vendor documentation)
- Python Record Linkage Toolkit — Open source record linkage patterns: indexing, comparison, classification (https://recordlinkage.readthedocs.io/) — HIGH confidence (direct documentation)
- KodiakHub supplier MDM guide — Feature landscape for supplier MDM (https://www.kodiakhub.com/blog/supplier-master-data-management-software) — MEDIUM confidence

# Pitfalls Research

**Domain:** Enterprise supplier data unification / record linkage (cross-ERP deduplication)
**Researched:** 2026-03-13
**Confidence:** HIGH (domain well-documented; project-specific concerns verified against multiple sources)

## Critical Pitfalls

### Pitfall 1: Transitive Closure Contamination (False Match Chains)

**What goes wrong:**
When building match groups via connected components (transitive closure), a single false positive match can chain together unrelated suppliers into one giant cluster. If A matches B (correctly) and B matches C (falsely), then A, B, and C all land in the same match group. This is the single most dangerous pattern in record linkage systems. Academic literature explicitly warns: "practical implementations often violate the transitivity assumption due to similarity-based matching creating false transitive connections" (Journal of Computer Science and Technology Studies, 2025). At 5K suppliers with multi-signal scoring, even a 1% false positive rate in pairwise matching can produce monster clusters that overwhelm reviewers and destroy trust in the system.

**Why it happens:**
Similarity-based matching is not truly transitive. Two suppliers can each be similar to an intermediate supplier (shared partial name, shared city) without being similar to each other. Connected components algorithm doesn't distinguish — it merges everything reachable. This is especially dangerous with embedding-based blocking where semantic similarity can create unexpected bridges.

**How to avoid:**
- Cap maximum cluster size (e.g., 10-15 suppliers). Flag groups exceeding the cap for manual review of individual edges rather than treating as one merge group.
- Require **minimum internal density** for clusters — every member should have at least 2 pairwise edges above threshold, not just 1 transitive path.
- Display the match graph to reviewers so they can see which edges caused the clustering and reject weak bridging links.
- Consider using a **cluster coherence score** (average pairwise similarity within group) and alert when coherence drops below threshold.

**Warning signs:**
- Match groups with 10+ members appearing frequently (rare for real suppliers).
- Groups containing suppliers from completely different industries or countries.
- Reviewers reporting "these don't belong together" on large groups.
- Wildly uneven group size distribution (most pairs, a few massive clusters).

**Phase to address:**
Phase 2 (ML Matching Engine) — must be built into the connected components algorithm from day one. Not fixable as an afterthought without re-running all matching.

---

### Pitfall 2: Blocking Strategy Silently Drops True Matches

**What goes wrong:**
Blocking is used to reduce the O(n^2) comparison space, but overly restrictive blocking keys cause true matches to never be compared. The system reports high precision (matches found are correct) but has terrible recall (many duplicates are missed entirely). Because missed matches are invisible — they never appear in the review queue — nobody notices. The SAP community whitepaper on master data deduplication explicitly notes that initial cleansing quality directly determines deduplication effectiveness; if key fields used for blocking are missing or inconsistent, matches are lost.

The project uses two-pass blocking: text-based (prefix + first token) and embedding-based (pgvector ANN, K=20). Each pass has its own failure modes:
- **Text blocking** fails on: name reorderings ("DUPONT JEAN" vs "JEAN DUPONT"), different transliterations ("MULLER" vs "MUELLER"), completely different legal names vs trading names.
- **Embedding blocking** with K=20 can miss matches if the embedding model doesn't capture the relationship, or if pgvector ANN returns approximate results that exclude true neighbors.

**Why it happens:**
Developers test blocking with known duplicates, confirm those are found, and declare success. They never measure what's missing because ground truth for the full dataset doesn't exist. The "pair completeness" metric (recall at the blocking stage) is rarely computed.

**How to avoid:**
- Generate a **synthetic ground truth** from the first batch of reviewer decisions — use confirmed matches to retroactively test blocking recall.
- Use **multiple independent blocking passes** (the project already plans this, which is good) and **union** their results — a pair only needs to pass one blocking criterion.
- For embedding blocking: set K higher than you think necessary (K=20 may be tight for 5K suppliers; consider K=30-50). At 5K suppliers, the comparison space is ~12.5M pairs; even K=50 only generates 250K candidates — very manageable.
- For pgvector ANN: set `hnsw.ef_search` higher (100-200 instead of default 40) to improve recall. Per pgvector docs: with default ef_search=40, filtered queries may return far fewer results than expected.
- Add a **phonetic blocking key** (Soundex/Metaphone on first name token) as a third blocking pass for name misspellings.

**Warning signs:**
- Reviewers discovering duplicates by browsing the unified DB that never appeared in the review queue.
- Suspiciously low match rates (e.g., <5% of suppliers have any match candidate).
- Running a manual spot-check of known duplicates and finding some were never surfaced.

**Phase to address:**
Phase 2 (ML Matching Engine) — blocking design is foundational. Phase 4 (Feedback Loop) should continuously measure blocking recall as reviewers confirm matches.

---

### Pitfall 3: Name Normalization Destroys Distinguishing Information

**What goes wrong:**
Aggressive name normalization (removing legal suffixes, collapsing spaces, uppercasing) can make genuinely different suppliers appear identical, or strip information needed to distinguish them. For example:
- Removing legal suffixes: "ACME SARL" and "ACME SAS" could be different legal entities (parent/subsidiary).
- Stripping all punctuation: "A.B.C. INDUSTRIE" becomes "ABC INDUSTRIE" — fine for matching, but if stored only in normalized form, you lose the ability to distinguish from "ABC INDUSTRIES" (different company).
- Unicode normalization: "ETABLISSEMENTS COTE" and "ETABLISSEMENTS COTE" (with accent) — NFD vs NFC decomposition matters for French supplier names from Sage X3.

The project description mentions French legal suffixes (SARL, SAS) and the data is from French ERP entities (EOT/TTEI) with likely mixed French/German/international supplier names.

**Why it happens:**
Normalization is treated as a preprocessing step that's "obvious." Developers normalize once, store the result, and discard the original. Or they normalize too aggressively for blocking (good) but use the same normalized form for comparison scoring (bad — loses signal).

**How to avoid:**
- **Store both raw and normalized forms.** Never discard original data. Use normalized form for blocking; use both for scoring.
- **Normalize in layers:** Level 1 (case folding, trim whitespace), Level 2 (remove legal suffixes, collapse punctuation), Level 3 (transliterate accents). Use Level 1 for display, Level 2 for blocking, Level 3 for phonetic comparison. Never apply Level 3 destructively.
- **Legal suffix removal should be a separate extracted field**, not destruction of the name. "DUPONT SAS" becomes name="DUPONT", legal_form="SAS" — both preserved.
- **Handle French/German characters properly**: e, e (with acute), e (with grave) should normalize to base character for comparison but display correctly. Use `unicodedata.normalize('NFD', name)` + strip combining characters for comparison only.

**Warning signs:**
- Reviewers asking "are these really the same company?" because legal forms differ.
- Normalized names producing ambiguous matches between parent companies and subsidiaries.
- Display showing ugly uppercased names with stripped characters that users can't recognize.

**Phase to address:**
Phase 1 (Ingestion Pipeline) — normalization logic must be designed correctly from the start. Retrofitting layered normalization after data is already stored is painful.

---

### Pitfall 4: Reviewer Fatigue and Inconsistent Decision-Making

**What goes wrong:**
With ~5K suppliers across 2 entities, the review queue could contain 500-2000+ match candidates. The SAP community's guideline is "100 master data reviews per person per week with complete analysis including investigation of purchasing history." At that rate, 2-5 reviewers need 1-4 weeks of dedicated review work. Fatigue sets in quickly:
- Reviewers start rubber-stamping "approve" on everything after 50+ reviews in a session.
- Different reviewers make contradictory decisions on similar pairs.
- High-confidence matches get the same review time as borderline cases.
- Reviewers skip investigating contextual fields (bank details, currencies, contacts) and judge only on name similarity.

Without consistency, the feedback loop (retraining signal weights from reviewer decisions) will learn noise, not signal.

**Why it happens:**
The review UI treats all match candidates equally. There's no triage mechanism, no session limits, no inter-reviewer consistency checks. The "no auto-merge" policy is correct for accuracy but creates a volume problem.

**How to avoid:**
- **Tier the review queue**: Auto-approve high-confidence matches above a tuned threshold (e.g., composite score > 0.95) with one-click confirmation, but still require human click. Focus deep review time on borderline cases (0.6-0.85).
- **Batch similar reviews**: Group pairs that share a common supplier so the reviewer builds context ("I'm reviewing all potential matches for DUPONT").
- **Track reviewer consistency**: If two reviewers see similar pairs and decide differently, flag for reconciliation. Monitor approval rates per reviewer per session.
- **Session limits**: Recommend max 30-50 reviews per session. Show a break prompt after 50.
- **Smart ordering**: Don't sort purely by confidence. Intersperse easy and hard cases to maintain engagement. Show progress ("47 of 312 reviewed, 265 remaining").
- **Keyboard shortcuts**: Space=approve, X=reject, arrow keys=navigate fields. Reduce friction to seconds per high-confidence review.

**Warning signs:**
- Reviewer approval rates exceeding 95% (suggests rubber-stamping, not quality review).
- Approval rate changing significantly between first hour and last hour of a session.
- Inter-reviewer agreement below 85% on overlapping samples.
- Feedback loop producing worse matching quality after retraining.

**Phase to address:**
Phase 3 (Review UI) — critical UX decisions. Phase 4 (Feedback Loop) — must validate reviewer consistency before using decisions for retraining.

---

### Pitfall 5: Re-Upload Lifecycle Creates Orphaned or Contradictory State

**What goes wrong:**
The project requires re-upload support: "new exports supersede old staged records, invalidate stale match candidates." This is deceptively complex. When a new CSV is uploaded for an entity that already has staged records:
- Some staged records may have already been matched and merged into the unified DB.
- Some may be in the review queue with pending human decisions.
- New upload may contain updated versions of the same suppliers, new suppliers, and removed suppliers.
- Match candidates involving old staged records become stale, but reviewers may have already seen them.

If handled incorrectly, you get: phantom matches referencing deleted records, unified records with provenance pointing to superseded source data, duplicate entries in unified DB (once from old upload, once from new), or lost review work.

**Why it happens:**
Developers build the happy path first (ingest → match → review → merge) and bolt on re-upload as an afterthought. The state machine for records (staged → matched → reviewing → merged/rejected) gets complex when "supersede" is introduced as a new transition from any state.

**How to avoid:**
- **Design the record lifecycle state machine before writing code.** States: `staged` → `matching` → `pending_review` → `approved`/`rejected` → `merged`. Add `superseded` as a terminal state reachable from `staged`, `pending_review`, and `rejected`.
- **Never mutate staged records in-place.** Each upload creates a new version. Old versions are marked `superseded` but retained for provenance.
- **Cascade invalidation carefully**: When a staged record is superseded, its match candidates become `stale`. Stale candidates are hidden from the review queue but preserved for audit. Already-merged records are NOT automatically invalidated (that would destroy confirmed work).
- **Present clear UI for "what changed"**: After re-upload, show the reviewer: "3 new suppliers, 47 updated suppliers (12 had pending reviews that were invalidated), 2 suppliers removed."
- **Make re-upload idempotent**: Uploading the same file twice should produce the same result, not duplicate records.

**Warning signs:**
- Match candidates in the review queue referencing records that no longer exist in staging.
- Unified records whose provenance trail leads to deleted/superseded source records.
- Duplicate golden records appearing after a re-upload.
- Review counts that don't add up (completed reviews + pending + invalidated != total generated).

**Phase to address:**
Phase 1 (Ingestion Pipeline) — lifecycle state machine. Phase 2 (Matching) — stale candidate invalidation. Phase 3 (Review UI) — supersession UX. This pitfall spans multiple phases and needs upfront architectural planning.

---

### Pitfall 6: Embedding Model Inappropriate for Company Name Matching

**What goes wrong:**
The project plans to use `all-MiniLM-L6-v2` (384-dim) for computing name embeddings. This model was trained on English natural language sentences (fine-tuned on 1B+ sentence pairs from diverse sources). It excels at semantic textual similarity for full sentences but has significant limitations for short company names, especially in non-English languages:
- Short inputs (<5 tokens) produce unstable embeddings — "DUPONT" and "DUPOND" may not be close at all despite being one character apart.
- The model doesn't understand that "ETABLISSEMENTS DUPONT" and "ETS DUPONT" are the same entity — it treats these as semantic similarity, not entity matching.
- French and German company names may get poor embeddings because the model is primarily English-trained.
- The model may produce high similarity for unrelated companies in the same industry ("ACME METALLURGIE" and "ATLAS METALLURGIE") because it captures topical similarity, not entity identity.
- Per the model card: "input text longer than 256 word pieces is truncated." Not an issue for names but reveals the model's sentence-level design intent.

**Why it happens:**
Developers reach for popular, well-documented embedding models without evaluating them on their actual data distribution. Sentence embedding models are optimized for semantic similarity between paragraphs, not character-level name matching.

**How to avoid:**
- **Treat embeddings as ONE signal among many, not the primary signal.** The project already plans multi-signal scoring (Jaro-Winkler, token Jaccard, embedding cosine, short name, currency, contact) — this is correct. Ensure the scoring weights don't over-index on embedding similarity.
- **Test embedding quality on actual data before committing.** Take 50 known duplicate pairs from the EOT/TTEI data, compute embedding cosine similarity, and compare to the distribution for random non-matching pairs. If there's no clear separation, reduce embedding weight or supplement with a character-level model.
- **Consider augmenting with character n-gram embeddings** (e.g., fastText) which are better for capturing morphological similarity in short strings. Or use TF-IDF on character 3-grams as an additional signal.
- **Use embeddings primarily for blocking** (finding candidates that text-based blocking would miss), not as a primary scoring signal. This is their strength: catching "ETABLISSEMENTS DUPONT" vs "ETS DUPONT" as candidates.

**Warning signs:**
- Embedding cosine similarity for known duplicates is not significantly higher than for random pairs.
- High embedding similarity between suppliers in the same industry that are clearly different companies.
- Embedding-based blocking not surfacing matches that text blocking missed (i.e., adding no value).

**Phase to address:**
Phase 2 (ML Matching Engine) — evaluate before committing to model weights. Phase 4 (Feedback Loop) — adjust signal weights based on reviewer decisions.

---

### Pitfall 7: Provenance Model Too Shallow to Be Useful

**What goes wrong:**
The project emphasizes "full provenance on every field in the unified record (source, who chose it, when)." But teams often implement provenance as a simple `source_entity` column on the golden record, which answers "where did this value come from?" but not:
- "What were the other options?" (the rejected values)
- "Why was this value chosen?" (reviewer's reasoning or auto-selection rule)
- "What was the original value before normalization?"
- "Can this decision be reversed?" (undo a merge)

Without deep provenance, auditing becomes impossible, merge undo is destructive, and users can't understand why a particular field value was selected.

**Why it happens:**
Provenance is designed as an afterthought data model ("just add a `source` column"). The actual complexity of tracking field-level decisions across multi-way merges with potential undo is underestimated.

**How to avoid:**
- **Design provenance as an event log, not just current state.** Each merge decision is an immutable event: `{reviewer, timestamp, match_group_id, field, chosen_value, chosen_source, rejected_alternatives: [{value, source}]}`.
- **Support merge undo**: A merge should be reversible by replaying the event log without it. This means golden records should be reconstructable from events, not just stored as final state.
- **Track normalization provenance separately**: Raw value → normalized value → chosen value. Three layers.
- **Store the match scores and signal breakdowns** that were shown to the reviewer when they made the decision. This is critical for audit ("why did you approve this?") and for the feedback loop.

**Warning signs:**
- Users asking "why is this address here?" and nobody can answer.
- Inability to undo a merge without manual data surgery.
- Audit requests that require rebuilding reviewer decisions from application logs instead of structured provenance.

**Phase to address:**
Phase 1 (Data Model Design) — provenance schema must be designed before any merge logic is built. Cannot be retrofitted.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Storing only normalized names, discarding raw | Simpler schema, less storage | Lose ability to distinguish similar-but-different entities; can't improve normalization later | Never — always store raw |
| Single monolithic matching job | Simpler to implement | Can't resume after failure; can't incrementally re-match; long-running Celery tasks hit visibility_timeout | Only for initial prototype with <1K records |
| Hardcoded matching thresholds | Faster to ship | Different data distributions need different thresholds; no way to tune without code changes | For first iteration only; must parameterize before production |
| No match candidate deduplication | Fewer DB queries | Same pair generated by multiple blocking passes appears twice in review queue; reviewer wastes time | Never — deduplicate candidates at insertion |
| JSONB for everything in staging | Schema flexibility | Can't index, can't validate, query performance degrades, can't enforce NOT NULL on critical fields | For truly optional/variable fields only; extract key matching fields to typed columns |
| Skip embedding index (exact scan) at 5K scale | No HNSW build time; perfect recall | Sets bad precedent; breaks at 10-20K; no learning about ANN tuning | Acceptable at 5K; must add index before scaling |

## Integration Gotchas

Common mistakes when connecting to external services/systems.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Sage X3 CSV exports | Assuming consistent column order across exports and entities | Map by column header name, never by position; validate headers match expected mapping on each upload |
| Sage X3 CSV encoding | Using `utf-8` instead of `utf-8-sig` for BOM stripping | Always use `encoding='utf-8-sig'` in Python; handle Windows-1252 fallback for older exports |
| Celery + Redis | Not setting `visibility_timeout` for long matching jobs | Set `broker_transport_options = {'visibility_timeout': 3600}` (1 hour) for matching tasks; default is 1 hour but may need more for large batches |
| Celery task results | Storing large result payloads in Redis | Use `ignore_result=True` for fire-and-forget matching jobs; store results in PostgreSQL; Redis result backend leaks memory with large payloads |
| pgvector HNSW index | Building index before data is loaded | Load all vectors first, then build index; building on empty table and inserting is much slower than bulk-load then index |
| sentence-transformers model | Downloading model at container startup | Pre-download during Docker build (`RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"`) — the project already plans this, which is correct |
| WebSocket notifications | Not handling reconnection on the frontend | Use exponential backoff reconnection; show "connection lost" indicator; queue notifications server-side for missed connections |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| O(n^2) pairwise comparison without blocking | Matching job takes hours, saturates CPU | Two-pass blocking (project already plans this) | >2K suppliers without blocking; >10K even with naive blocking |
| Loading all 268-284 CSV columns into memory | OOM during ingestion; slow parsing | Parse only mapped columns; use chunked reading (`pd.read_csv(chunksize=500)`) | >10K rows with 280+ columns |
| Full-table embedding cosine scan (no index) | Query latency >5s for finding neighbors | Use pgvector HNSW index; exact scan is fine at 5K but not at 20K | >10K vectors with 384 dimensions |
| Single Celery task for entire matching job | No progress visibility; can't resume on failure; Redis visibility_timeout causes task re-delivery | Break into per-entity-pair or per-block subtasks; use Celery chord for aggregation | >5K suppliers or >30 min matching time |
| Sending full match details over WebSocket | Frontend freezes on large payloads | Send only notification IDs; let frontend fetch details via REST | >100 match groups with >5 signals each |
| Unbounded review queue query | Slow page load as match candidates grow | Paginate; default to pending-only filter; lazy-load signal breakdowns | >5K match candidates |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| No audit trail on merge decisions | Can't prove who approved a questionable supplier merge; compliance risk for financial systems consuming unified data | Log every review action with reviewer ID, timestamp, IP, and full before/after state |
| Storing supplier bank details (from Sage X3 data) without encryption at rest | PII/financial data exposure if DB is compromised | Encrypt sensitive columns (bank account, VAT numbers) at rest; consider masking in the review UI |
| Basic auth credentials in plain text | On-prem server doesn't mean secure; internal threats exist | Hash passwords with bcrypt; use HTTPS even for internal traffic; session timeout after inactivity |
| CSV upload without size/content validation | Malicious CSV with formula injection (`=CMD()`) or massive file causes DoS | Validate file size limits; strip formula-like content (`=`, `+`, `-`, `@` at cell start); validate expected column headers before processing |
| No rate limiting on auth endpoints | Brute-force password attacks | Implement login attempt throttling (5 attempts then 15-min lockout) even for internal tools |

## UX Pitfalls

Common user experience mistakes in the review/merge domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing all 200+ shared columns in side-by-side comparison | Information overload; reviewer can't find the fields that matter | Show only conflicting fields by default; expandable section for "all fields"; highlight differences with color coding |
| No undo for merge decisions | Reviewer accidentally approves wrong match; no way back without admin intervention | Soft-merge: mark as merged but allow undo within 24 hours; never physically delete source records |
| Confidence score shown as raw decimal (0.847362) | Meaningless to non-technical reviewers | Show as descriptive label ("High Match - 85%") with color indicator (green/yellow/red); show signal breakdown as plain language ("Names are very similar, same currency, different city") |
| Review queue sorted only by confidence | High-confidence pairs that are obvious take reviewer time; borderline pairs get deferred forever | Offer multiple sort options: confidence, source pair, date added; filter by status; show batch-review mode for high-confidence items |
| No indication of review progress or completion | Reviewers don't know how much work remains; no sense of accomplishment | Dashboard showing: total candidates, reviewed, remaining, estimated time; celebrate milestones ("50% complete!") |
| Mandatory deep review for every match | 2-5 reviewers spending weeks on obvious matches | Two-tier review: quick-confirm for high-confidence matches (single click); deep review for borderline cases (side-by-side, all signals) |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **CSV Ingestion:** Often missing handling of embedded semicolons within quoted fields — verify with production CSV files containing addresses with semicolons
- [ ] **Name Normalization:** Often missing country-specific legal suffix lists — verify French (SARL, SAS, EURL, SA, SCI), German (GmbH, AG, KG, OHG), and international (LLC, Ltd, Inc, PLC, BV, NV) suffixes are all handled
- [ ] **Blocking:** Often missing evaluation of blocking recall — verify by computing pair completeness on a sample of known matches
- [ ] **Match Scoring:** Often missing calibration — verify that score distributions separate true matches from non-matches by plotting histogram of scores for confirmed match/non-match pairs
- [ ] **Review UI:** Often missing keyboard navigation — verify reviewers can process a review in <10 seconds for obvious matches without touching the mouse
- [ ] **Merge Logic:** Often missing multi-way merge (3+ suppliers) — verify that merging a group of 3 produces one golden record, not two sequential pairwise merges
- [ ] **Provenance:** Often missing provenance on fields that were auto-selected (no conflict) — verify that even unanimous field values record which sources contributed
- [ ] **Re-upload:** Often missing handling of "supplier exists in new upload but was already merged" — verify the system shows the reviewer that new data is available for an already-unified supplier
- [ ] **WebSocket:** Often missing authentication on WebSocket connection — verify that only authenticated users receive notifications
- [ ] **Docker Compose:** Often missing volume persistence for PostgreSQL data — verify `docker-compose down && docker-compose up` retains all data

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Transitive closure contamination | MEDIUM | Identify contaminated clusters by size/coherence; split into sub-clusters; re-present split groups for review; does NOT require re-running all matching if individual pairwise scores are preserved |
| Blocking recall loss | HIGH | Cannot recover missed matches without re-running blocking with wider parameters; all existing review work is preserved but new candidates will appear in the queue |
| Name normalization data loss | HIGH | If raw data was discarded, must re-ingest from source CSV; if raw was preserved, can rebuild normalization pipeline and re-normalize |
| Reviewer inconsistency | MEDIUM | Identify conflicting decisions through inter-reviewer comparison; re-present conflicting cases to a senior reviewer; do NOT retrain signal weights until consistency is established |
| Re-upload state corruption | HIGH | Requires careful DB surgery to identify orphaned records and stale references; prevent by designing lifecycle state machine upfront |
| Embedding model mismatch | LOW | Embeddings are just one signal; reduce its weight in scoring; can swap model and re-embed without losing other matching work |
| Shallow provenance | HIGH | Retrofitting provenance requires migrating existing golden records to new schema and backfilling missing audit data from application logs (if available) |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Transitive closure contamination | Phase 2 (Matching Engine) | Cluster size distribution analysis; no clusters >15 without manual review of edges |
| Blocking recall loss | Phase 2 (Matching Engine) + Phase 4 (Feedback) | Pair completeness metric >95% on confirmed matches; measure after first review batch |
| Name normalization data loss | Phase 1 (Ingestion Pipeline) | Raw and normalized columns both populated; normalization is reversible; test with French/German names |
| Reviewer fatigue/inconsistency | Phase 3 (Review UI) | Inter-reviewer agreement >85% on overlapping sample; session length tracking; approval rate monitoring |
| Re-upload lifecycle corruption | Phase 1 (Data Model) + Phase 2 (Matching) | State machine diagram documented; integration test for full re-upload cycle including supersession of reviewed records |
| Embedding model mismatch | Phase 2 (Matching Engine) | Embedding similarity histogram shows clear bimodal distribution for match vs non-match pairs |
| Shallow provenance | Phase 1 (Data Model) | Merge undo tested end-to-end; audit query "show me all decisions for supplier X" returns complete history |

## Sources

- SAP Community: "De-duplication of Master Data during large SAP Implementation Projects" (2014, republished 2022) — real-world pitfalls and mitigation plans from enterprise deduplication projects. Guideline of 100 master data reviews/person/week. [HIGH confidence]
  - https://community.sap.com/t5/technology-blog-posts-by-members/de-duplication-of-master-data-during-large-sap-implementation-projects/ba-p/13250311
- Semantic Visions: "Entity Resolution: How entity resolution changes working with data" (Jan 2026) — threshold tuning tradeoffs, hybrid matching approaches. [HIGH confidence]
  - https://www.semantic-visions.com/insights/entity-resolution
- Journal of Computer Science and Technology Studies (2025) — transitive closure violations in practical entity resolution. [HIGH confidence]
  - https://al-kindipublishers.org/index.php/jcsts/article/download/10554/9286
- ACM Journal of Data and Information Quality (2025): "Graph Metrics-driven Record Cluster Repair" — errors from transitive closure in entity resolution. [HIGH confidence]
  - https://dl.acm.org/doi/10.1145/3735511
- pgvector official documentation — HNSW/IVFFlat recall vs performance tradeoffs, ef_search tuning, filtered query behavior. [HIGH confidence, Context7 verified]
  - https://github.com/pgvector/pgvector
- sentence-transformers/all-MiniLM-L6-v2 model card — training data (English sentences), 256 token limit, 384 dimensions. [HIGH confidence]
  - https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2
- Celery/Redis: GitHub discussions on visibility_timeout causing task re-delivery for long-running tasks (2025). [HIGH confidence]
  - https://github.com/celery/celery/discussions/7276
- Medium: "How to Normalize Company Names for Deduplication and Matching" — language-specific normalization, legal suffix handling, diacritics. [MEDIUM confidence]
  - https://medium.com/tilo-tech/how-to-normalize-company-names-for-deduplication-and-matching-21e9720b30ba
- Data Doctrine: "The Myth of the Golden Record in Master Data Management" (Sep 2025) — survivorship rules pitfalls, incomplete status traps. [MEDIUM confidence]
  - https://data-doctrine.com/blog/golden-record-master-data/
- Springer: "Blocking Techniques for Entity Linkage" — pair completeness vs reduction ratio tradeoff. [HIGH confidence]
  - https://link.springer.com/article/10.1007/s41019-020-00146-w

---
*Pitfalls research for: Enterprise supplier data unification (OneBase)*
*Researched: 2026-03-13*