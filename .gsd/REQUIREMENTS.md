# Requirements

## Active

(None — all M001 MVP requirements are validated)

## Validated

### UNIF-03 — User can browse unified suppliers with provenance badges showing field origins

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S05

User can browse unified suppliers with provenance badges showing field origins. Verified by 5 browse tests + UnifiedSuppliers frontend page.

### UNIF-04 — User can view merge history and audit trail for any unified record

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S05

User can view merge history and audit trail for any unified record. Verified by detail test + UnifiedSupplierDetail page with audit trail sidebar.

### UNIF-05 — User can promote singleton suppliers (no match candidates) directly into the unified database

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S05

User can promote singleton suppliers directly into unified database. Verified by 5 singleton tests (list, exclude matched, promote, already-unified guard, bulk promote).

### UNIF-06 — User can export the unified supplier database as CSV/Excel with provenance metadata

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S05

User can export unified supplier database as CSV with provenance metadata. Verified by 2 export tests. Note: CSV only (no Excel) — sufficient for MVP scale.

### OPS-01 — Dashboard displays upload status, match stats, review progress, and recent activity

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S05

Dashboard displays upload status, match stats, review progress, and recent activity. Verified by 2 dashboard tests + Dashboard page with stat cards, progress bars, and activity feed.

### OPS-05 — System sends WebSocket notifications when matching jobs complete

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S03

System sends WebSocket notifications when matching jobs complete

### INGS-01 — User can upload semicolon-delimited CSV exports from configured Sage X3 entities (EOT, TTEI)

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S01

User can upload semicolon-delimited CSV exports from configured Sage X3 entities (EOT, TTEI)

### INGS-02 — System parses uploaded files with BOM stripping, whitespace trimming, and correct delimiter handling

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S01

System parses uploaded files with BOM stripping, whitespace trimming, and correct delimiter handling

### INGS-03 — User can configure column mappings per data source as JSON (mapping canonical fields to source columns)

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S01

User can configure column mappings per data source as JSON (mapping canonical fields to source columns)

### INGS-04 — System normalizes supplier names on ingestion (uppercase, remove legal suffixes, collapse spaces)

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S01

System normalizes supplier names on ingestion (uppercase, remove legal suffixes, collapse spaces)

### INGS-05 — System computes name embeddings (all-MiniLM-L6-v2, 384 dims) for each ingested supplier

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S01

System computes name embeddings (all-MiniLM-L6-v2, 384 dims) for each ingested supplier

### INGS-06 — System stores both raw JSONB data and extracted key fields in staging tables

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S01

System stores both raw JSONB data and extracted key fields in staging tables

### INGS-07 — When a new file is uploaded for an existing source, old staged records are marked superseded and stale match candidates are invalidated

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S01

When a new file is uploaded for an existing source, old staged records are marked superseded and stale match candidates are invalidated

### INGS-08 — System automatically enqueues a Celery matching task after ingestion completes

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S01

System automatically enqueues a Celery matching task after ingestion completes

### MTCH-01 — System performs text-based blocking (first 3 chars of normalized name + first token) to generate candidate pairs

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S03

System performs text-based blocking (first 3 chars of normalized name + first token) to generate candidate pairs

### MTCH-02 — System performs embedding-based blocking via pgvector ANN search (K=20+) to catch non-prefix matches

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S03

System performs embedding-based blocking via pgvector ANN search (K=20+) to catch non-prefix matches

### MTCH-03 — System scores candidate pairs using multi-signal matching (Jaro-Winkler, token Jaccard, embedding cosine, short name, currency, contact)

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S03

System scores candidate pairs using multi-signal matching (Jaro-Winkler, token Jaccard, embedding cosine, short name, currency, contact)

### MTCH-04 — System computes a weighted confidence score (0-1) for each candidate pair

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S03

System computes a weighted confidence score (0-1) for each candidate pair

### MTCH-05 — System detects transitive match groups via connected components (A matches B, B matches C = one group)

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S03

System detects transitive match groups via connected components (A matches B, B matches C = one group)

### MTCH-06 — All candidates above configurable threshold are inserted as pending match candidates for review

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S03

All candidates above configurable threshold are inserted as pending match candidates for review

### MTCH-07 — System stores per-signal scores in match_signals JSONB for explainability

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S03

System stores per-signal scores in match_signals JSONB for explainability

### MTCH-08 — System supports retraining signal weights via logistic regression from accumulated reviewer decisions

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S03

System supports retraining signal weights via logistic regression from accumulated reviewer decisions

### OPS-02 — User can manage data sources (add/edit name, description, column mappings) via the UI

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S02

User can manage data sources (add/edit name, description, column mappings) via the UI

### OPS-03 — System authenticates users with username/password (local accounts)

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S01

System authenticates users with username/password (local accounts)

### OPS-04 — System logs all user actions (uploads, reviews, merges) in an audit trail

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S01

System logs all user actions (uploads, reviews, merges) in an audit trail

### OPS-06 — All UI pages are production-grade with dark theme, built using frontend-design skill

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S02

All UI pages are production-grade with dark theme, built using frontend-design skill

### REVW-01 — User can view a review queue of pending match candidates sorted by confidence

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S04

User can view a review queue of pending match candidates sorted by confidence

### REVW-02 — User can filter the review queue by source pair (e.g., EOT vs TTEI) and confidence range

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S04

User can filter the review queue by source pair (e.g., EOT vs TTEI) and confidence range

### REVW-03 — User can view side-by-side match detail with signal breakdowns showing why records matched

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S04

User can view side-by-side match detail with signal breakdowns showing why records matched

### REVW-04 — System highlights field-level conflicts between matched records

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S04

System highlights field-level conflicts between matched records

### REVW-05 — User can pick which source value to keep for each conflicting field during merge

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S04

User can pick which source value to keep for each conflicting field during merge

### REVW-06 — User can confirm a merge (when all conflicts resolved), reject a match, or skip for later

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S04

User can confirm a merge (when all conflicts resolved), reject a match, or skip for later

### REVW-07 — Identical fields across sources are auto-included in the merged record

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S04

Identical fields across sources are auto-included in the merged record

### REVW-08 — Source-only fields (present in one source only) are auto-included with source label

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S04

Source-only fields (present in one source only) are auto-included with source label

### UNIF-01 — Confirmed merges produce a golden record in the unified supplier database

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S04

Confirmed merges produce a golden record in the unified supplier database

### UNIF-02 — Every field in a unified record tracks full provenance (source entity, source record, who chose it, when)

- Status: validated
- Class: core-capability
- Source: inferred
- Primary Slice: S04

Every field in a unified record tracks full provenance (source entity, source record, who chose it, when)

## Deferred

## Out of Scope
