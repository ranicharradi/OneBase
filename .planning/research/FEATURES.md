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
