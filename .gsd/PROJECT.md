# OneBase — Enterprise Supplier Data Unification Platform

## What This Is

OneBase ingests supplier master data exported from multiple Sage X3 ERP entities (semicolon-delimited CSV), detects duplicate suppliers across entities using ML-based matching, supports human review of match candidates with field-level conflict highlighting, and produces a unified supplier database with full merge provenance. Built for a small team of 2-5 reviewers on an on-prem server, targeting full deduplication of ~5K suppliers across 2 current entities (EOT, TTEI) within weeks.

## Core Value

Accurate cross-entity supplier deduplication with human-in-the-loop merge — every match is reviewed, every field choice is tracked, every golden record has full provenance.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Ingest semicolon-delimited CSV exports from multiple Sage X3 entities (EOT, TTEI, future sources)
- [ ] Configurable column mappings per data source stored as JSON
- [ ] Parse with BOM stripping, whitespace trimming, and name normalization (uppercase, remove legal suffixes, collapse spaces)
- [ ] Compute name embeddings (all-MiniLM-L6-v2, 384 dims) for semantic matching
- [ ] ML-based cross-entity matching with multi-signal scoring (Jaro-Winkler, token Jaccard, embedding cosine, short name, currency, contact)
- [ ] Two-pass blocking: text-based (prefix + first token) and embedding-based (pgvector ANN, K=20)
- [ ] Transitive match group detection (connected components) for multi-way merges
- [ ] All match candidates go to human review — no auto-merge
- [ ] Review queue sorted by confidence with filtering by source pair and confidence range
- [ ] Side-by-side match detail with signal breakdowns and field-level conflict highlighting
- [ ] Field-by-field merge: reviewer picks which source value to keep for each conflicting field
- [ ] Full provenance on every field in the unified record (source, who chose it, when)
- [ ] Singleton promotion: suppliers with no matches can be accepted as-is into unified DB
- [ ] Re-upload lifecycle: new exports supersede old staged records, invalidate stale match candidates
- [ ] Dashboard with upload, stats, and recent activity
- [ ] Browse unified suppliers with provenance badges
- [ ] Manage data sources and column mappings
- [ ] Basic auth (username/password, local accounts) with audit trail
- [ ] WebSocket notifications when matching jobs complete
- [ ] Feedback loop: reviewer decisions can retrain signal weights via logistic regression

### Out of Scope

- Export back to Sage X3 — unified DB is source of truth, no write-back
- Role-based access control — all users are equal reviewers
- Scheduled/automated imports — on-demand upload only
- Auto-merge — all merges require human confirmation
- Mobile app — desktop web only
- GPU-based ML — CPU-only, lightweight models

## Context

### Current State

No existing deduplication process. Duplicate suppliers exist unchecked across Sage X3 entities. This is the first tooling to address the problem.

### Data Sources

Two Sage X3 folders export supplier data as semicolon-delimited CSV:

- **FournisseurEOT.csv** — EOT entity, ~1,623 suppliers, 284 columns, codes prefixed `FE`
- **FournisseurTTEI.csv** — TTEI entity, ~3,309 suppliers, 268 columns, codes prefixed `FL`

Schemas overlap (~200 shared columns) but diverge: EOT has expanded RITCOD arrays (0-29), YAPPROB, YCLASS, XDOMACT; TTEI has custom X-fields (XCONTRAT, XCERTIF2, XCOEF, XCOST, etc.) and INVORIMOD, ZTYPENVOI. Additional CSV/Excel sources will be added over time.

### Data Quality Issues

- Trailing whitespace in names
- Quoted values with internal spaces
- Empty short names in TTEI
- Mixed currencies across entities for same supplier
- Legal suffixes vary inconsistently (SARL, SAS, GmbH, LLC)
- UTF-8 BOM prefix in files

### Scale

~5K suppliers currently across 2 sources, expected to grow to 10-20K suppliers across 5-10 sources. 2-5 reviewers, potentially growing.

### Tech Stack

| Component | Technology |
|-----------|------------|
| Backend API | Python 3.12, FastAPI |
| Task Queue | Celery + Redis |
| Database | PostgreSQL 16 with pgvector |
| ORM | SQLAlchemy |
| ML/Matching | scikit-learn, sentence-transformers, thefuzz, recordlinkage |
| Vector Search | pgvector (PostgreSQL extension) |
| Frontend | React (all pages built with frontend-design skill for production-grade UI) |
| Deployment | Docker Compose (on-prem) |
| Documentation | Context7 MCP for up-to-date library docs during implementation |

### Architecture

```
CSV/Excel Upload
       |
       v
+------------------+
| Ingestion Pipeline| -- Parse -> Map -> Normalize -> Embed
+--------+---------+
         v
+------------------+
|  Staging Tables   | -- PostgreSQL (raw JSONB + extracted key fields)
+--------+---------+
         v
+------------------+
| ML Matching Engine| -- Celery async task
|  (multi-signal)   | -- Blocking -> Compare -> Score
+--------+---------+
         v
+------------------+
|  Review Queue     | -- All candidates, sorted by confidence
+--------+---------+
         v
+------------------+
|   Review UI       | -- Side-by-side, conflict highlight, field-by-field merge
|   (React)         |
+--------+---------+
         v
+------------------+
| Unified Supplier  | -- Golden records + provenance metadata
|    Database       |
+------------------+
```

### Docker Compose Services

| Service | Role |
|---------|------|
| `api` | FastAPI application server |
| `worker` | Celery worker (same codebase as api) |
| `frontend` | React app (nginx in production) |
| `postgres` | PostgreSQL 16 with pgvector |
| `redis` | Celery broker + result backend |

### Implementation Notes

- Use **Context7 MCP** during implementation for up-to-date documentation on FastAPI, SQLAlchemy, Celery, React, sentence-transformers, and other libraries.
- Use **frontend-design skill** for ALL React UI implementation — every page production-grade, dark theme, data-heavy enterprise design.
- Use **pgvector** PostgreSQL extension for embedding storage and similarity search.
- The `all-MiniLM-L6-v2` model is lightweight (80MB) and runs on CPU. Pre-download during Docker build.
- Use PostgreSQL image with pgvector extension pre-installed (`pgvector/pgvector:pg16`).

## Constraints

- **Deployment**: On-prem server, Docker Compose — no cloud services
- **ML**: CPU-only, no GPU — lightweight models only (all-MiniLM-L6-v2)
- **Team**: 2-5 reviewers, all equal permissions, basic auth sufficient
- **Timeline**: Weeks — need to start cleaning EOT vs TTEI supplier data soon
- **Data**: Semicolon-delimited CSV with known quality issues (BOM, whitespace, mixed encodings)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| No auto-merge | Data accuracy is paramount; human review required for every match | — Pending |
| pgvector for embeddings | Keeps everything in PostgreSQL, no separate vector DB needed | — Pending |
| all-MiniLM-L6-v2 | Lightweight CPU model, 384 dims, good quality for name matching | — Pending |
| Two-pass blocking | Text blocking is fast for obvious matches, embedding blocking catches non-prefix matches | — Pending |
| Dark theme enterprise UI | Data-heavy views need high contrast; professional look for internal tool | — Pending |
| frontend-design skill for all pages | Every page production-grade — dashboard, review queue, match detail, unified view, sources | — Pending |
| Context7 MCP for library docs | Ensures current API usage, not stale training data | — Pending |

---
*Last updated: 2026-03-15 after S04 (Review Merge) completion — review queue, side-by-side match detail, and field-level merge with provenance are live*
