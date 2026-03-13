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
