# Two-Stage Matching: Intra-Source Grouping + Cross-Source Matching

**Date:** 2026-03-25
**Status:** Approved
**Approach:** Pre-filter in pipeline (Approach 1)

## Problem

TTEI has 3,294 rows but only 2,034 unique supplier names — 1,260 rows are excess duplicates. Each duplicate multiplies cross-file candidate pairs (N x M). EOT has 1,621 rows with 1,543 unique names (78 duplicates). The current pipeline matches every row against every row across sources, producing an unnecessarily large candidate set.

## Solution

Two-stage matching within the existing pipeline:

- **Stage 1 — Intra-source grouping:** Collapse exact `normalized_name` duplicates within each source into groups. Pick the richest row as the group representative.
- **Stage 2 — Cross-source matching:** Run the existing blocking/scoring/clustering pipeline on representatives only. Expand group members into the unified record at merge time.

Expected reduction: TTEI 3,294 -> 2,034 representatives (38%), EOT 1,621 -> 1,543 (5%). Cross-source pairs drop proportionally.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Grouping threshold | Exact `normalized_name` match | Zero false positives. The 1,260 TTEI duplicates are exact name matches. Fuzzy grouping (85% or even 95%) risks silent false merges with no human review. |
| Representative selection | Row with most populated canonical fields, tie-break by lowest ID | Better scoring quality than arbitrary pick. Simpler than synthetic representative (no Frankenstein rows, provenance stays clean). |
| Merge behavior | Expand to all group members in `source_supplier_ids` | Full provenance — the unified record tracks every raw row it absorbed, not just the representatives. No review UI changes needed (reviewer still sees two representatives). |
| Storage | `intra_source_group_id` column on `StagedSupplier` | Lightweight — one nullable FK column. No new tables. Merge-time lookup is a simple `WHERE intra_source_group_id = :rep_id`. |
| Architecture | New step inside existing pipeline | Single Celery task, no coordination complexity. Grouping is sub-second for ~5K rows. |
| Rejection behavior | Rejecting a representative covers the whole group | Non-representative members are never independently surfaced for cross-source review. This is correct — they share the same normalized_name as the representative, so a rejection of the representative applies to the group. |

## Schema Change

New nullable column on `staged_suppliers`, defined in the ORM model (`app/models/staging.py`):

```python
intra_source_group_id = Column(Integer, ForeignKey("staged_suppliers.id"), nullable=True)
```

Added to `__table_args__`:

```python
Index("ix_staged_intra_group", "intra_source_group_id"),
```

- **Ungrouped rows:** `NULL` (single-member groups or grouping hasn't run)
- **Group members:** set to the representative's `id`
- **Representatives:** `intra_source_group_id = self.id`

A row is a representative when `intra_source_group_id = id` OR `intra_source_group_id IS NULL`.

Backward-compatible: existing rows start as NULL and behave as single-member groups.

One Alembic migration (`alembic/versions/006_add_intra_source_group_id.py`). The existing migrations are 001-005; the `down_revision` chain determines ordering, not filenames.

## New Service: `app/services/grouping.py`

Single function `group_intra_source(db, source_ids) -> dict`:

1. Query all active `StagedSupplier` rows for given `source_ids`
2. Group by `(data_source_id, normalized_name)` using `defaultdict`
3. For groups with 2+ members:
   - Pick representative: most non-null canonical fields (`name`, `source_code`, `short_name`, `currency`, `payment_terms`, `contact_name`, `supplier_type`), break ties by lowest `id`
   - Set `intra_source_group_id = representative.id` on all members (including representative)
4. Single-member groups: leave `intra_source_group_id` as `NULL`
5. Return stats: `{"groups_formed": int, "rows_grouped": int, "representatives": int}`

**Idempotency:** Before grouping, clear existing `intra_source_group_id` for the given sources, scoped to active rows only: `UPDATE staged_suppliers SET intra_source_group_id = NULL WHERE data_source_id IN (...) AND status = 'active'`. Superseded rows are not touched.

## Pipeline Integration: `app/services/matching.py`

New step in `run_matching_pipeline`. The precise ordering:

```
Step 0:     Invalidate old candidates (existing, unchanged)
            Compute source_ids via _get_active_source_ids() (existing, unchanged)
Step 0.5:   Intra-source grouping (NEW) — uses source_ids
            Early exit if < 2 sources (existing check, moved AFTER grouping)
Step 1:     Blocking (modified — filter to representatives)
Step 2:     Scoring (modified — signal weights use representatives only)
Step 3:     Clustering (unchanged)
Step 4:     Inserting (unchanged)
```

**Key ordering change:** The `len(source_ids) < 2` early exit is moved after grouping. This means grouping runs even for single-source uploads. This is intentional — it pre-groups intra-source duplicates so they're ready when a second source arrives later.

### Step 0.5

Call `group_intra_source(db, source_ids)`. Report progress via `_report("GROUPING", ...)`.

### Blocking changes

Both `text_block` and `embedding_block` gain a new optional parameter `representative_ids: set[int] | None`:

- **`text_block`**: When provided, filter the initial supplier query to `StagedSupplier.id.in_(representative_ids)`. The cross-source guard is unchanged.
- **`embedding_block`**: Filter both the outer iteration set (`_get_suppliers_with_embeddings`) AND the neighbor query (`_get_embedding_neighbors`) to `representative_ids`. Without filtering neighbors, a representative from source A would find non-representative neighbors from source B, producing pairs with non-representatives.

`matching.py` computes the representative set:

```python
from sqlalchemy import or_

reps = db.query(StagedSupplier.id).filter(
    StagedSupplier.data_source_id.in_(source_ids),
    StagedSupplier.status == "active",
    or_(
        StagedSupplier.intra_source_group_id == StagedSupplier.id,
        StagedSupplier.intra_source_group_id.is_(None),
    )
)
representative_ids = {r.id for r in reps}
```

### Signal weight computation

The `compute_signal_weights` call in `matching.py` currently queries all active suppliers. After grouping, it must query only representatives (same `representative_ids` set). This avoids duplicate rows skewing coverage statistics — e.g., 100 rows with `currency=None` would incorrectly reduce the currency coverage ratio.

### No changes to

- `score_pair` — operates on supplier pairs as before
- `find_groups` — clusters pairs as before
- `MatchCandidate` / `MatchGroup` insertion — unchanged

## Merge Expansion: `app/services/merge.py`

New helper in `merge.py`:

```python
def _expand_group_members(db: Session, supplier_id: int) -> list[int]:
    supplier = db.get(StagedSupplier, supplier_id)
    if supplier is None:
        return [supplier_id]  # guard: supplier deleted/missing, degrade gracefully
    group_id = supplier.intra_source_group_id
    if group_id is None:
        return [supplier_id]  # ungrouped
    member_ids = db.query(StagedSupplier.id).filter(
        StagedSupplier.intra_source_group_id == group_id
    ).all()
    return [m.id for m in member_ids]
```

In `execute_merge`, replace `source_supplier_ids=[supplier_a.id, supplier_b.id]` with:

```python
all_source_ids = (
    _expand_group_members(db, supplier_a.id) +
    _expand_group_members(db, supplier_b.id)
)
```

**Audit log update:** The audit trail entry in `execute_merge` must also use `all_source_ids` instead of `[supplier_a.id, supplier_b.id]` so the audit record matches the unified record's `source_supplier_ids`.

No changes to: field comparison, conflict resolution, provenance fields, review UI, or review API.

## Singleton Promotion: `app/routers/unified.py`

Non-representative group members don't appear in match candidates (only representatives are matched). Before their representative is merged, they would incorrectly appear as singleton candidates via `list_singletons`.

**Fix:** Add a filter to the singleton query to exclude non-representative group members. A supplier is excluded from singleton candidacy if `intra_source_group_id IS NOT NULL AND intra_source_group_id != id` (it's a non-representative member of a group).

This ensures only representatives and ungrouped suppliers appear in the singleton list, which is correct — the group is handled as a unit.

## Testing Strategy

### New: `tests/test_grouping.py`

- Exact-name duplicates within one source -> grouped, richest row is representative
- Similar but not identical names -> NOT grouped
- Single-member groups -> `intra_source_group_id` stays NULL
- Cross-source same name -> NOT grouped (intra-source only)
- Idempotency: running twice produces same result
- Representative selection: most populated canonical fields wins, lowest ID breaks ties

### Extended: `tests/test_matching_service.py`

- Pipeline with duplicates produces fewer candidates than without grouping
- Representative-only filtering: non-representative rows excluded from blocking
- Signal weight computation uses representatives only

### Extended: `tests/test_review_merge.py`

- Merging grouped representatives -> `source_supplier_ids` includes all group members
- Merging ungrouped suppliers -> `source_supplier_ids` is `[a.id, b.id]` (backward compat)
- Audit log records expanded `source_supplier_ids`

### Unchanged

Existing review API tests, auth tests, ingestion tests.

## Files Changed

| File | Change |
|------|--------|
| `app/models/staging.py` | Add `intra_source_group_id` column + index in `__table_args__` |
| `alembic/versions/006_add_intra_source_group_id.py` | New migration |
| `app/services/grouping.py` | **New file** — `group_intra_source()` |
| `app/services/blocking.py` | Add `representative_ids` filter to `text_block`, `embedding_block`, and `_get_embedding_neighbors` |
| `app/services/matching.py` | Add grouping step, compute representative set, pass to blocking and signal weights, move early exit after grouping |
| `app/services/merge.py` | Add `_expand_group_members()`, use in `execute_merge`, update audit log |
| `app/routers/unified.py` | Filter non-representative members from singleton list |
| `tests/test_grouping.py` | **New file** — grouping unit tests |
| `tests/test_matching_service.py` | Extend with grouping integration tests |
| `tests/test_review_merge.py` | Extend with group expansion tests |
