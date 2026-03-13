# Roadmap: OneBase

## Overview

OneBase delivers supplier deduplication through a strict pipeline: data must be ingested before it can be matched, matches must exist before they can be reviewed, and reviews produce golden records. The four phases follow this pipeline — foundation and ingestion first, then matching, then human review and merge, then browsing/dashboard/polish. Each phase delivers a complete, testable capability that feeds the next.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4): Planned milestone work
- Decimal phases (e.g., 2.1): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Foundation + Ingestion Pipeline** - Docker environment, database schema, auth, CSV upload, parsing, normalization, embedding generation, and data source management
- [ ] **Phase 2: Matching Engine** - Two-pass blocking, multi-signal scoring, transitive clustering, and WebSocket job notifications
- [ ] **Phase 3: Review + Merge** - Human review queue, side-by-side comparison, field-by-field merge, golden record creation with provenance
- [ ] **Phase 4: Unified Browse, Dashboard + Polish** - Browse unified suppliers, dashboard with stats, singleton promotion, merge history, export

## Phase Details

### Phase 1: Foundation + Ingestion Pipeline
**Goal**: Users can upload supplier CSV files and see them parsed, normalized, and stored with embeddings — on a running Docker environment with authentication
**Depends on**: Nothing (first phase)
**Requirements**: INGS-01, INGS-02, INGS-03, INGS-04, INGS-05, INGS-06, INGS-07, INGS-08, OPS-02, OPS-03, OPS-04, OPS-06
**Success Criteria** (what must be TRUE):
  1. User can log in with username/password and all actions are recorded in an audit trail
  2. User can upload a semicolon-delimited CSV file for a configured data source and see it parsed without errors (BOM stripped, whitespace trimmed, delimiters handled)
  3. User can configure and manage data sources with column mappings via the UI
  4. Uploaded supplier names are normalized (uppercase, legal suffixes removed, spaces collapsed) and embeddings are computed — visible in staged data
  5. Re-uploading a file for an existing source supersedes old staged records and a matching task is automatically enqueued
**Plans**: TBD

Plans:
- [ ] 01-01: TBD
- [ ] 01-02: TBD
- [ ] 01-03: TBD

### Phase 2: Matching Engine
**Goal**: System automatically finds duplicate supplier candidates across entities using multi-signal ML matching, and notifies users when complete
**Depends on**: Phase 1
**Requirements**: MTCH-01, MTCH-02, MTCH-03, MTCH-04, MTCH-05, MTCH-06, MTCH-07, MTCH-08, OPS-05
**Success Criteria** (what must be TRUE):
  1. After ingestion, system generates match candidates via text-based blocking (prefix + first token) and embedding-based blocking (pgvector ANN)
  2. Each candidate pair has a composite confidence score (0-1) with per-signal breakdowns (Jaro-Winkler, token Jaccard, embedding cosine, short name, currency, contact) stored for explainability
  3. Transitive match groups are detected (A-B and B-C produces one A-B-C group) with sensible cluster size limits
  4. User receives a WebSocket notification when a matching job completes
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD

### Phase 3: Review + Merge
**Goal**: Reviewers can examine match candidates, compare suppliers side-by-side with conflict highlighting, and merge them field-by-field into golden records with full provenance
**Depends on**: Phase 2
**Requirements**: REVW-01, REVW-02, REVW-03, REVW-04, REVW-05, REVW-06, REVW-07, REVW-08, UNIF-01, UNIF-02
**Success Criteria** (what must be TRUE):
  1. User can view a review queue of pending matches sorted by confidence, filterable by source pair and confidence range
  2. User can open a match and see side-by-side supplier comparison with signal breakdowns explaining why records matched, and field-level conflicts highlighted
  3. User can pick which source value to keep for each conflicting field, with identical and source-only fields auto-handled
  4. User can confirm a merge (producing a golden record with full field-level provenance), reject a match, or skip for later
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD
- [ ] 03-03: TBD

### Phase 4: Unified Browse, Dashboard + Polish
**Goal**: Users can browse the unified supplier database, view merge history, promote singletons, export data, and see operational stats on a dashboard
**Depends on**: Phase 3
**Requirements**: UNIF-03, UNIF-04, UNIF-05, UNIF-06, OPS-01
**Success Criteria** (what must be TRUE):
  1. User can browse unified suppliers with provenance badges showing which source each field came from
  2. User can view merge history and full audit trail for any unified record
  3. User can promote singleton suppliers (no match candidates) directly into the unified database
  4. User can export the unified supplier database as CSV/Excel with provenance metadata
  5. Dashboard displays upload status, match stats, review progress, and recent activity
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation + Ingestion Pipeline | 0/3 | Not started | - |
| 2. Matching Engine | 0/2 | Not started | - |
| 3. Review + Merge | 0/3 | Not started | - |
| 4. Unified Browse, Dashboard + Polish | 0/2 | Not started | - |
