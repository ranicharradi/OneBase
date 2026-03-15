# OneBase — Enterprise Supplier Data Unification Platform

## What This Is

OneBase ingests supplier master data exported from multiple Sage X3 ERP entities (semicolon-delimited CSV), detects duplicate suppliers across entities using ML-based matching, supports human review of match candidates with field-level conflict highlighting, and produces a unified supplier database with full merge provenance. Built for a small team of 2-5 reviewers on an on-prem server, targeting full deduplication of ~5K suppliers across 2 current entities (EOT, TTEI) within weeks.

## Core Value

Accurate cross-entity supplier deduplication with human-in-the-loop merge — every match is reviewed, every field choice is tracked, every golden record has full provenance.

## Current State

**M001 MVP complete.** The platform is fully functional end-to-end: CSV ingestion → ML matching → human review → golden records with provenance. All 35 requirements validated with 176 passing tests. Ready for production deployment via Docker Compose.

### What's Built

- **Ingestion pipeline:** CSV upload with BOM/cp1252 handling, configurable column mappings, name normalization (24 legal suffixes), 384-dim embeddings (all-MiniLM-L6-v2), re-upload supersession
- **Matching engine:** Text + embedding blocking, 6-signal weighted scoring (Jaro-Winkler, token Jaccard, cosine, short name, currency, contact), Union-Find clustering, Celery-orchestrated pipeline with WebSocket notifications
- **Review UI:** Queue with source-pair/confidence filtering, side-by-side comparison with signal breakdowns, field-level conflict resolution via radio buttons, merge/reject/skip actions
- **Unified records:** Golden records with per-field JSONB provenance, singleton detection + promotion, CSV export, browsing with provenance badges
- **Dashboard:** Operational stats (upload/match/review/unified), review progress bars, recent activity feed, 30s auto-refresh
- **Design system:** Dark Precision Editorial — Instrument Serif + Outfit fonts, cyan accent, atmospheric glass UI across all 8 pages
- **Infrastructure:** Docker Compose (5 services), JWT auth, audit trail, 3 Alembic migrations

### What's Next

No milestones queued. Potential future work:
- Operational hardening (error recovery, performance profiling, monitoring)
- Multi-way group merge (current: pairwise only)
- Additional export formats (Excel/XLSX)
- Cursor pagination for large datasets
- Scheduled/automated imports

## Requirements

### Validated (35)

All M001 MVP requirements validated — see `.gsd/REQUIREMENTS.md` for full list with evidence.

**Ingestion (8):** CSV upload, parsing, column mappings, normalization, embeddings, staging, re-upload supersession, auto-enqueue matching
**Matching (8):** Text blocking, embedding blocking, multi-signal scoring, weighted confidence, transitive clustering, threshold filtering, signal storage, weight retraining
**Review (8):** Queue, filters, side-by-side detail, conflict highlighting, field selection, merge/reject/skip, auto-include identical, auto-include source-only
**Unified (6):** Golden records, provenance, browse, detail/audit trail, singleton promotion, CSV export
**Operations (6):** Dashboard, source management, auth, audit trail, WebSocket notifications, production UI

### Active

(None)

### Out of Scope

- Export back to Sage X3 — unified DB is source of truth, no write-back
- Role-based access control — all users are equal reviewers
- Scheduled/automated imports — on-demand upload only
- Auto-merge — all merges require human confirmation
- Mobile app — desktop web only
- GPU-based ML — CPU-only, lightweight models

## Context

### Data Sources

Two Sage X3 folders export supplier data as semicolon-delimited CSV:

- **FournisseurEOT.csv** — EOT entity, ~1,623 suppliers, 284 columns, codes prefixed `FE`
- **FournisseurTTEI.csv** — TTEI entity, ~3,309 suppliers, 268 columns, codes prefixed `FL`

Schemas overlap (~200 shared columns) but diverge. Additional CSV/Excel sources can be added over time via the Sources management UI.

### Scale

~5K suppliers across 2 sources. Platform designed for up to 10-20K suppliers across 5-10 sources with 2-5 reviewers.

### Tech Stack

| Component | Technology |
|-----------|------------|
| Backend API | Python 3.12, FastAPI |
| Task Queue | Celery + Redis |
| Database | PostgreSQL 16 with pgvector |
| ORM | SQLAlchemy 2.0 (sync) |
| ML/Matching | rapidfuzz, sentence-transformers (all-MiniLM-L6-v2) |
| Vector Search | pgvector (PostgreSQL extension) |
| Frontend | React 19, Vite 6, TypeScript, Tailwind CSS 4, TanStack Query |
| Design | Dark Precision Editorial (Instrument Serif + Outfit, cyan accent) |
| Deployment | Docker Compose (on-prem) |

### Architecture

```
CSV Upload → Ingestion Pipeline (parse → map → normalize → embed)
    → Staging Tables (PostgreSQL + pgvector)
    → ML Matching Engine (Celery: block → score → cluster)
    → Review Queue (all candidates, human review)
    → Review UI (side-by-side, field-level merge)
    → Unified Supplier Database (golden records + provenance)
    → Dashboard (stats, activity, export)
```

### Docker Compose Services

| Service | Role |
|---------|------|
| `api` | FastAPI application server |
| `worker` | Celery worker (same codebase as api) |
| `frontend` | React app (nginx in production) |
| `postgres` | PostgreSQL 16 with pgvector |
| `redis` | Celery broker + result backend + pub/sub |

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| No auto-merge | Data accuracy is paramount; human review required for every match | Validated |
| pgvector for embeddings | Keeps everything in PostgreSQL, no separate vector DB needed | Validated |
| all-MiniLM-L6-v2 | Lightweight CPU model, 384 dims, good quality for name matching | Validated |
| Two-pass blocking | Text blocking is fast for obvious matches, embedding blocking catches non-prefix matches | Validated |
| Dark Precision Editorial UI | Data-heavy views need high contrast; premium feel for internal tool | Validated |
| Sync SQLAlchemy | Simpler architecture, matches Celery worker pattern | Validated |
| PBKDF2-SHA256 | Stdlib-only, no binary dependency issues | Validated |
| JSONB provenance | Per-field tracking on unified_suppliers, adequate for ~5K scale | Validated |
| Pairwise merge only | Covers primary review flow; multi-way merge deferred | Validated |

## Constraints

- **Deployment**: On-prem server, Docker Compose — no cloud services
- **ML**: CPU-only, no GPU — lightweight models only
- **Team**: 2-5 reviewers, all equal permissions, basic auth
- **Data**: Semicolon-delimited CSV with BOM, whitespace, mixed encodings

---
*Last updated: 2026-03-15 — M001 MVP complete. All 5 slices delivered, all 35 requirements validated, 176 tests passing.*
