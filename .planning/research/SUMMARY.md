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
