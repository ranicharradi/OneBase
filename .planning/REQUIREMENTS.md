# Requirements: OneBase

**Defined:** 2026-03-13
**Core Value:** Accurate cross-entity supplier deduplication with human-in-the-loop merge — every match is reviewed, every field choice is tracked, every golden record has full provenance.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Ingestion

- [ ] **INGS-01**: User can upload semicolon-delimited CSV exports from configured Sage X3 entities (EOT, TTEI)
- [ ] **INGS-02**: System parses uploaded files with BOM stripping, whitespace trimming, and correct delimiter handling
- [ ] **INGS-03**: User can configure column mappings per data source as JSON (mapping canonical fields to source columns)
- [ ] **INGS-04**: System normalizes supplier names on ingestion (uppercase, remove legal suffixes, collapse spaces)
- [ ] **INGS-05**: System computes name embeddings (all-MiniLM-L6-v2, 384 dims) for each ingested supplier
- [ ] **INGS-06**: System stores both raw JSONB data and extracted key fields in staging tables
- [ ] **INGS-07**: When a new file is uploaded for an existing source, old staged records are marked superseded and stale match candidates are invalidated
- [ ] **INGS-08**: System automatically enqueues a Celery matching task after ingestion completes

### Matching

- [ ] **MTCH-01**: System performs text-based blocking (first 3 chars of normalized name + first token) to generate candidate pairs
- [ ] **MTCH-02**: System performs embedding-based blocking via pgvector ANN search (K=20+) to catch non-prefix matches
- [ ] **MTCH-03**: System scores candidate pairs using multi-signal matching (Jaro-Winkler, token Jaccard, embedding cosine, short name, currency, contact)
- [ ] **MTCH-04**: System computes a weighted confidence score (0-1) for each candidate pair
- [ ] **MTCH-05**: System detects transitive match groups via connected components (A matches B, B matches C = one group)
- [ ] **MTCH-06**: All candidates above configurable threshold are inserted as pending match candidates for review
- [ ] **MTCH-07**: System stores per-signal scores in match_signals JSONB for explainability
- [ ] **MTCH-08**: System supports retraining signal weights via logistic regression from accumulated reviewer decisions

### Review

- [ ] **REVW-01**: User can view a review queue of pending match candidates sorted by confidence
- [ ] **REVW-02**: User can filter the review queue by source pair (e.g., EOT vs TTEI) and confidence range
- [ ] **REVW-03**: User can view side-by-side match detail with signal breakdowns showing why records matched
- [ ] **REVW-04**: System highlights field-level conflicts between matched records
- [ ] **REVW-05**: User can pick which source value to keep for each conflicting field during merge
- [ ] **REVW-06**: User can confirm a merge (when all conflicts resolved), reject a match, or skip for later
- [ ] **REVW-07**: Identical fields across sources are auto-included in the merged record
- [ ] **REVW-08**: Source-only fields (present in one source only) are auto-included with source label

### Unified Database

- [ ] **UNIF-01**: Confirmed merges produce a golden record in the unified supplier database
- [ ] **UNIF-02**: Every field in a unified record tracks full provenance (source entity, source record, who chose it, when)
- [ ] **UNIF-03**: User can browse unified suppliers with provenance badges showing field origins
- [ ] **UNIF-04**: User can view merge history and audit trail for any unified record
- [ ] **UNIF-05**: User can promote singleton suppliers (no match candidates) directly into the unified database
- [ ] **UNIF-06**: User can export the unified supplier database as CSV/Excel with provenance metadata

### Operations

- [ ] **OPS-01**: Dashboard displays upload status, match stats, review progress, and recent activity
- [ ] **OPS-02**: User can manage data sources (add/edit name, description, column mappings) via the UI
- [ ] **OPS-03**: System authenticates users with username/password (local accounts)
- [ ] **OPS-04**: System logs all user actions (uploads, reviews, merges) in an audit trail
- [ ] **OPS-05**: System sends WebSocket notifications when matching jobs complete
- [ ] **OPS-06**: All UI pages are production-grade with dark theme, built using frontend-design skill

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Matching

- **AMTCH-01**: System auto-suggests optimal confidence threshold based on precision/recall curves
- **AMTCH-02**: User can batch-accept high-confidence matches (>0.95) in bulk

### Data Management

- **DMGT-01**: User can undo a merge (unmerge a golden record back to source records)
- **DMGT-02**: System supports Excel file uploads in addition to CSV

### Monitoring

- **MNTR-01**: Dashboard shows matching quality metrics (precision, recall estimates)
- **MNTR-02**: Inter-reviewer consistency tracking across overlapping reviews

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Export/write-back to Sage X3 | Unified DB is source of truth; ERP write-back is enormously complex |
| Role-based access control (RBAC) | 2-5 equal reviewers; RBAC adds complexity with zero value at this team size |
| Scheduled/automated imports | On-demand upload is simpler and safer; 2-5 users doing periodic dedup |
| Auto-merge without human confirmation | Data accuracy is paramount; review queue IS the product |
| Mobile app | Data-heavy review workflow needs large screens with dense tables |
| GPU-based ML infrastructure | On-prem constraint; all-MiniLM-L6-v2 runs fine on CPU |
| Third-party data enrichment (D&B, EcoVadis) | Adds cost, API complexity, compliance concerns; not the problem being solved |
| Multi-domain MDM (customer, product) | Supplier-focused; multi-domain is massive scope creep |
| Real-time/streaming deduplication | Batch processing is correct for periodic CSV exports |
| Complex approval workflows | 2-5 users; single-step review is sufficient |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INGS-01 | — | Pending |
| INGS-02 | — | Pending |
| INGS-03 | — | Pending |
| INGS-04 | — | Pending |
| INGS-05 | — | Pending |
| INGS-06 | — | Pending |
| INGS-07 | — | Pending |
| INGS-08 | — | Pending |
| MTCH-01 | — | Pending |
| MTCH-02 | — | Pending |
| MTCH-03 | — | Pending |
| MTCH-04 | — | Pending |
| MTCH-05 | — | Pending |
| MTCH-06 | — | Pending |
| MTCH-07 | — | Pending |
| MTCH-08 | — | Pending |
| REVW-01 | — | Pending |
| REVW-02 | — | Pending |
| REVW-03 | — | Pending |
| REVW-04 | — | Pending |
| REVW-05 | — | Pending |
| REVW-06 | — | Pending |
| REVW-07 | — | Pending |
| REVW-08 | — | Pending |
| UNIF-01 | — | Pending |
| UNIF-02 | — | Pending |
| UNIF-03 | — | Pending |
| UNIF-04 | — | Pending |
| UNIF-05 | — | Pending |
| UNIF-06 | — | Pending |
| OPS-01 | — | Pending |
| OPS-02 | — | Pending |
| OPS-03 | — | Pending |
| OPS-04 | — | Pending |
| OPS-05 | — | Pending |
| OPS-06 | — | Pending |

**Coverage:**
- v1 requirements: 36 total
- Mapped to phases: 0
- Unmapped: 36

---
*Requirements defined: 2026-03-13*
*Last updated: 2026-03-13 after initial definition*
