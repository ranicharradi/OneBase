# M001: OneBase MVP

**Vision:** OneBase ingests supplier master data exported from multiple Sage X3 ERP entities (semicolon-delimited CSV), detects duplicate suppliers across entities using ML-based matching, supports human review of match candidates with field-level conflict highlighting, and produces a unified supplier database with full merge provenance.

## Success Criteria


## Slices

- [x] **S01: Foundation Ingestion Pipeline** `risk:medium` `depends:[]`
  > After this: Set up the entire Docker environment, backend project structure, database schema with all Phase 1 models, Alembic migrations, JWT authentication, audit trail, and test infrastructure.
- [x] **S02: Design Polish** `risk:medium` `depends:[S01]`
  > After this: Establish a distinctive design system and redesign the core shell (Layout + Login) following the frontend-design skill guidelines.
- [x] **S03: Matching Engine** `risk:medium` `depends:[S02]`
  > After this: Build the matching engine foundation: data model extensions, configuration, and the three core algorithm services (blocking, scoring, clustering) with comprehensive tests.
- [x] **S04: Review Merge** `risk:medium` `depends:[S03]`
  > After this: Reviewers can examine match candidates, compare suppliers side-by-side, and merge them field-by-field into golden records with full provenance.
- [ ] **S05: Unified Browse, Dashboard + Polish** `risk:medium` `depends:[S04]`
  > After this: Users can browse unified suppliers with provenance badges, view merge history, promote singletons, export data, and see dashboard stats.
