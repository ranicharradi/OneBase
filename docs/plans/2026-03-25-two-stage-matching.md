# Two-Stage Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add intra-source grouping to the matching pipeline so exact-name duplicates within each source are collapsed before cross-source matching, reducing candidate pair explosion.

**Architecture:** New `group_intra_source()` service runs as Step 0.5 in `run_matching_pipeline`, before blocking. It groups by exact `normalized_name` within each source, picks the richest row as representative, and tags all members via a new `intra_source_group_id` column on `StagedSupplier`. Blocking/scoring then operate on representatives only. Merge expands group members into the unified record's `source_supplier_ids`.

**Tech Stack:** Python 3.12, SQLAlchemy, Alembic, FastAPI, pytest (SQLite)

**Spec:** `docs/specs/2026-03-25-two-stage-matching-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/app/models/staging.py` | Modify | Add `intra_source_group_id` column + index |
| `backend/alembic/versions/006_add_intra_source_group_id.py` | Create | Migration for new column |
| `backend/app/services/grouping.py` | Create | `group_intra_source()` — intra-source grouping logic |
| `backend/app/services/blocking.py` | Modify | Add `representative_ids` filter to `text_block`, `embedding_block`, `_get_embedding_neighbors`, `_get_suppliers_with_embeddings` |
| `backend/app/services/matching.py` | Modify | Wire grouping into pipeline, compute representative set, pass to blocking + signal weights |
| `backend/app/services/merge.py` | Modify | Add `_expand_group_members()`, use in `execute_merge` + audit log |
| `backend/app/routers/unified.py` | Modify | Filter non-representative members from singleton list |
| `backend/tests/test_grouping.py` | Create | Unit tests for grouping service |
| `backend/tests/test_matching_service.py` | Modify | Integration tests for pipeline with grouping |
| `backend/tests/test_review_merge.py` | Modify | Tests for merge group expansion |

---

### Task 1: Schema — Add `intra_source_group_id` Column

**Files:**
- Modify: `backend/app/models/staging.py:12-42`
- Create: `backend/alembic/versions/006_add_intra_source_group_id.py`

- [ ] **Step 1: Add column to ORM model**

In `backend/app/models/staging.py`, add the column after `name_embedding` (line 28) and add the index to `__table_args__`:

```python
# After line 28 (name_embedding):
intra_source_group_id = Column(Integer, ForeignKey("staged_suppliers.id"), nullable=True)

# In __table_args__, add before the closing paren:
Index("ix_staged_intra_group", "intra_source_group_id"),
```

The full `__table_args__` becomes:

```python
__table_args__ = (
    Index("ix_staged_normalized_name", "normalized_name"),
    Index("ix_staged_source_status", "data_source_id", "status"),
    Index("ix_staged_source_code", "data_source_id", "source_code"),
    Index("ix_staged_intra_group", "intra_source_group_id"),
    Index(
        "ix_staged_name_embedding_hnsw",
        "name_embedding",
        postgresql_using="hnsw",
        postgresql_with={"m": 16, "ef_construction": 64},
        postgresql_ops={"name_embedding": "vector_cosine_ops"},
    ),
)
```

- [ ] **Step 2: Create Alembic migration**

Create `backend/alembic/versions/006_add_intra_source_group_id.py`:

```python
"""Add intra_source_group_id to staged_suppliers

Revision ID: 006
Revises: 005
Create Date: 2026-03-25

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "staged_suppliers",
        sa.Column("intra_source_group_id", sa.Integer(), sa.ForeignKey("staged_suppliers.id"), nullable=True),
    )
    op.create_index("ix_staged_intra_group", "staged_suppliers", ["intra_source_group_id"])


def downgrade() -> None:
    op.drop_index("ix_staged_intra_group", table_name="staged_suppliers")
    op.drop_column("staged_suppliers", "intra_source_group_id")
```

- [ ] **Step 3: Verify existing tests still pass**

Run: `cd backend && python3 -m pytest tests/ -x -q`
Expected: All existing tests pass (the new nullable column doesn't break anything).

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/staging.py backend/alembic/versions/006_add_intra_source_group_id.py
git commit -m "feat: add intra_source_group_id column to StagedSupplier"
```

---

### Task 2: Grouping Service — `group_intra_source()`

**Files:**
- Create: `backend/app/services/grouping.py`
- Create: `backend/tests/test_grouping.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_grouping.py`:

```python
"""Tests for intra-source grouping service."""

from sqlalchemy.orm import Session

from app.models.staging import StagedSupplier
from app.models.source import DataSource
from app.models.batch import ImportBatch


def _make_source(db: Session, name: str) -> DataSource:
    src = DataSource(name=name, file_format="csv", column_mapping={"name": "N"})
    db.add(src)
    db.flush()
    return src


def _make_batch(db: Session, source: DataSource) -> ImportBatch:
    batch = ImportBatch(
        data_source_id=source.id,
        filename="test.csv",
        uploaded_by="testuser",
        status="completed",
    )
    db.add(batch)
    db.flush()
    return batch


def _make_supplier(
    db: Session,
    batch: ImportBatch,
    source: DataSource,
    name: str,
    normalized_name: str | None = None,
    short_name: str | None = None,
    currency: str | None = None,
    contact_name: str | None = None,
    source_code: str | None = None,
    payment_terms: str | None = None,
    supplier_type: str | None = None,
) -> StagedSupplier:
    s = StagedSupplier(
        import_batch_id=batch.id,
        data_source_id=source.id,
        name=name,
        normalized_name=normalized_name or name.upper(),
        raw_data={"name": name},
        status="active",
        short_name=short_name,
        currency=currency,
        contact_name=contact_name,
        source_code=source_code,
        payment_terms=payment_terms,
        supplier_type=supplier_type,
    )
    db.add(s)
    db.flush()
    return s


# ---------- group_intra_source tests ----------


def test_exact_name_duplicates_grouped(test_db):
    """Rows with same normalized_name within one source are grouped together."""
    from app.services.grouping import group_intra_source

    src = _make_source(test_db, "TTEI")
    batch = _make_batch(test_db, src)
    s1 = _make_supplier(test_db, batch, src, "Acme Corp", normalized_name="ACME CORP")
    s2 = _make_supplier(test_db, batch, src, "ACME CORP", normalized_name="ACME CORP")
    s3 = _make_supplier(test_db, batch, src, "acme corp", normalized_name="ACME CORP")
    test_db.flush()

    stats = group_intra_source(test_db, [src.id])
    test_db.flush()

    assert stats["groups_formed"] == 1
    assert stats["rows_grouped"] == 3

    # All share the same intra_source_group_id
    test_db.refresh(s1)
    test_db.refresh(s2)
    test_db.refresh(s3)
    assert s1.intra_source_group_id == s2.intra_source_group_id == s3.intra_source_group_id
    assert s1.intra_source_group_id is not None


def test_different_names_not_grouped(test_db):
    """Rows with different normalized_names are NOT grouped (no fuzzy matching)."""
    from app.services.grouping import group_intra_source

    src = _make_source(test_db, "TTEI")
    batch = _make_batch(test_db, src)
    s1 = _make_supplier(test_db, batch, src, "Tunisie Telecom", normalized_name="TUNISIE TELECOM")
    s2 = _make_supplier(test_db, batch, src, "Tunisie Cables", normalized_name="TUNISIE CABLES")
    test_db.flush()

    stats = group_intra_source(test_db, [src.id])
    test_db.flush()

    assert stats["groups_formed"] == 0
    test_db.refresh(s1)
    test_db.refresh(s2)
    assert s1.intra_source_group_id is None
    assert s2.intra_source_group_id is None


def test_single_member_not_grouped(test_db):
    """A unique supplier (no duplicates) stays ungrouped (NULL)."""
    from app.services.grouping import group_intra_source

    src = _make_source(test_db, "TTEI")
    batch = _make_batch(test_db, src)
    s1 = _make_supplier(test_db, batch, src, "Unique Corp", normalized_name="UNIQUE CORP")
    test_db.flush()

    stats = group_intra_source(test_db, [src.id])
    test_db.flush()

    assert stats["groups_formed"] == 0
    test_db.refresh(s1)
    assert s1.intra_source_group_id is None


def test_cross_source_same_name_not_grouped(test_db):
    """Same normalized_name across different sources are NOT grouped together."""
    from app.services.grouping import group_intra_source

    src1 = _make_source(test_db, "TTEI")
    src2 = _make_source(test_db, "EOT")
    batch1 = _make_batch(test_db, src1)
    batch2 = _make_batch(test_db, src2)
    s1 = _make_supplier(test_db, batch1, src1, "Acme Corp", normalized_name="ACME CORP")
    s2 = _make_supplier(test_db, batch2, src2, "Acme Corp", normalized_name="ACME CORP")
    test_db.flush()

    stats = group_intra_source(test_db, [src1.id, src2.id])
    test_db.flush()

    assert stats["groups_formed"] == 0
    test_db.refresh(s1)
    test_db.refresh(s2)
    assert s1.intra_source_group_id is None
    assert s2.intra_source_group_id is None


def test_representative_is_richest_row(test_db):
    """Representative is the row with the most populated canonical fields."""
    from app.services.grouping import group_intra_source

    src = _make_source(test_db, "TTEI")
    batch = _make_batch(test_db, src)
    # s1: sparse (only name)
    s1 = _make_supplier(test_db, batch, src, "Acme Corp", normalized_name="ACME CORP")
    # s2: rich (name + currency + contact)
    s2 = _make_supplier(
        test_db, batch, src, "Acme Corp", normalized_name="ACME CORP",
        currency="TND", contact_name="Ali Ben",
    )
    # s3: medium (name + currency)
    s3 = _make_supplier(
        test_db, batch, src, "Acme Corp", normalized_name="ACME CORP",
        currency="TND",
    )
    test_db.flush()

    group_intra_source(test_db, [src.id])
    test_db.flush()

    # s2 is the representative (most fields populated)
    test_db.refresh(s1)
    test_db.refresh(s2)
    test_db.refresh(s3)
    assert s1.intra_source_group_id == s2.id
    assert s2.intra_source_group_id == s2.id
    assert s3.intra_source_group_id == s2.id


def test_representative_tiebreak_lowest_id(test_db):
    """When richness is tied, the row with the lowest ID wins."""
    from app.services.grouping import group_intra_source

    src = _make_source(test_db, "TTEI")
    batch = _make_batch(test_db, src)
    # Same richness (both have just name + currency)
    s1 = _make_supplier(
        test_db, batch, src, "Acme Corp", normalized_name="ACME CORP",
        currency="TND",
    )
    s2 = _make_supplier(
        test_db, batch, src, "Acme Corp", normalized_name="ACME CORP",
        currency="EUR",
    )
    test_db.flush()

    group_intra_source(test_db, [src.id])
    test_db.flush()

    # s1 has lower ID, wins tiebreak
    test_db.refresh(s1)
    test_db.refresh(s2)
    assert s1.intra_source_group_id == s1.id
    assert s2.intra_source_group_id == s1.id


def test_idempotency(test_db):
    """Running grouping twice produces the same result."""
    from app.services.grouping import group_intra_source

    src = _make_source(test_db, "TTEI")
    batch = _make_batch(test_db, src)
    s1 = _make_supplier(test_db, batch, src, "Acme Corp", normalized_name="ACME CORP")
    s2 = _make_supplier(test_db, batch, src, "Acme Corp", normalized_name="ACME CORP")
    test_db.flush()

    stats1 = group_intra_source(test_db, [src.id])
    test_db.flush()
    test_db.refresh(s1)
    group_id_first = s1.intra_source_group_id

    stats2 = group_intra_source(test_db, [src.id])
    test_db.flush()
    test_db.refresh(s1)
    group_id_second = s1.intra_source_group_id

    assert group_id_first == group_id_second
    assert stats1["groups_formed"] == stats2["groups_formed"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python3 -m pytest tests/test_grouping.py -v`
Expected: `ModuleNotFoundError: No module named 'app.services.grouping'`

- [ ] **Step 3: Write the implementation**

Create `backend/app/services/grouping.py`:

```python
"""Intra-source grouping service — collapses exact-name duplicates within each data source.

Groups StagedSupplier rows that share the same (data_source_id, normalized_name).
Picks the richest row (most populated canonical fields) as the group representative.
Sets intra_source_group_id on all group members to the representative's ID.
"""

import logging
from collections import defaultdict

from sqlalchemy.orm import Session

from app.models.staging import StagedSupplier

logger = logging.getLogger(__name__)

# Fields used to determine "richness" for representative selection
_CANONICAL_FIELDS = [
    "name", "source_code", "short_name", "currency",
    "payment_terms", "contact_name", "supplier_type",
]


def _count_populated(supplier: StagedSupplier) -> int:
    """Count non-null canonical fields on a supplier."""
    return sum(
        1 for f in _CANONICAL_FIELDS
        if getattr(supplier, f, None) is not None
        and str(getattr(supplier, f)).strip()
    )


def _pick_representative(members: list[StagedSupplier]) -> StagedSupplier:
    """Pick the group representative: most populated canonical fields, lowest ID tiebreak."""
    return max(members, key=lambda s: (_count_populated(s), -s.id))


def group_intra_source(db: Session, source_ids: list[int]) -> dict:
    """Group exact-name duplicates within each source.

    Args:
        db: Database session.
        source_ids: List of data source IDs to process.

    Returns:
        Dict with groups_formed, rows_grouped, representatives counts.
    """
    # Idempotency: clear existing group assignments for these sources (active only)
    db.query(StagedSupplier).filter(
        StagedSupplier.data_source_id.in_(source_ids),
        StagedSupplier.status == "active",
        StagedSupplier.intra_source_group_id.isnot(None),
    ).update(
        {StagedSupplier.intra_source_group_id: None},
        synchronize_session="fetch",
    )

    # Query all active suppliers for given sources
    suppliers = (
        db.query(StagedSupplier)
        .filter(
            StagedSupplier.data_source_id.in_(source_ids),
            StagedSupplier.status == "active",
        )
        .all()
    )

    # Group by (data_source_id, normalized_name)
    groups: dict[tuple[int, str], list[StagedSupplier]] = defaultdict(list)
    for s in suppliers:
        if s.normalized_name:
            groups[(s.data_source_id, s.normalized_name)].append(s)

    groups_formed = 0
    rows_grouped = 0

    for key, members in groups.items():
        if len(members) < 2:
            continue  # Single-member group: leave as NULL

        rep = _pick_representative(members)
        for member in members:
            member.intra_source_group_id = rep.id

        groups_formed += 1
        rows_grouped += len(members)

    db.flush()

    representatives = groups_formed  # One rep per group
    logger.info(
        "Intra-source grouping: %d groups, %d rows grouped, %d representatives",
        groups_formed, rows_grouped, representatives,
    )

    return {
        "groups_formed": groups_formed,
        "rows_grouped": rows_grouped,
        "representatives": representatives,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python3 -m pytest tests/test_grouping.py -v`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/grouping.py backend/tests/test_grouping.py
git commit -m "feat: add intra-source grouping service with tests"
```

---

### Task 3: Blocking — Add Representative Filtering

**Files:**
- Modify: `backend/app/services/blocking.py:21-195`
- Modify: `backend/tests/test_matching_service.py`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_matching_service.py`:

```python
def test_text_block_filters_to_representatives(test_db):
    """text_block only considers suppliers in representative_ids when provided."""
    from app.services.blocking import text_block

    src1 = _make_source(test_db, "TTEI")
    src2 = _make_source(test_db, "EOT")
    batch1 = _make_batch(test_db, src1)
    batch2 = _make_batch(test_db, src2)

    # src1: two rows with same normalized name — only one is representative
    s1_rep = _make_supplier(test_db, batch1, src1, "Acme Corp", normalized_name="ACME CORP")
    s1_dup = _make_supplier(test_db, batch1, src1, "Acme Corp", normalized_name="ACME CORP")
    # src2: one row
    s2 = _make_supplier(test_db, batch2, src2, "Acme Corporation", normalized_name="ACME CORPORATION")
    test_db.flush()

    # Without filter: both src1 rows pair with src2
    # (they share prefix "ACM" and first token "ACME" with s2)
    pairs_all = text_block(test_db, [src1.id, src2.id])
    assert len(pairs_all) == 2  # s1_rep-s2 and s1_dup-s2

    # With filter: only representative pairs with src2
    rep_ids = {s1_rep.id, s2.id}
    pairs_filtered = text_block(test_db, [src1.id, src2.id], representative_ids=rep_ids)
    assert len(pairs_filtered) == 1
    pair = pairs_filtered.pop()
    assert min(s1_rep.id, s2.id) == pair[0]
    assert max(s1_rep.id, s2.id) == pair[1]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3 -m pytest tests/test_matching_service.py::test_text_block_filters_to_representatives -v`
Expected: `TypeError` — `text_block()` got an unexpected keyword argument `representative_ids`.

- [ ] **Step 3: Modify `text_block` to accept `representative_ids`**

In `backend/app/services/blocking.py`, update the `text_block` function signature and query:

```python
def text_block(
    db: Session, source_ids: list[int], representative_ids: set[int] | None = None
) -> set[tuple[int, int]]:
```

Add filter after the existing `.filter(...)` block (after line 37):

```python
    query = (
        db.query(StagedSupplier)
        .filter(
            StagedSupplier.data_source_id.in_(source_ids),
            StagedSupplier.status == "active",
        )
    )
    if representative_ids is not None:
        query = query.filter(StagedSupplier.id.in_(representative_ids))
    suppliers = query.all()
```

- [ ] **Step 4: Modify `_get_suppliers_with_embeddings` and `_get_embedding_neighbors`**

Update `_get_suppliers_with_embeddings` signature and query:

```python
def _get_suppliers_with_embeddings(
    db: Session, source_ids: list[int], representative_ids: set[int] | None = None
) -> list[StagedSupplier]:
```

Add filter:

```python
    query = (
        db.query(StagedSupplier)
        .filter(
            StagedSupplier.data_source_id.in_(source_ids),
            StagedSupplier.status == "active",
            StagedSupplier.name_embedding.isnot(None),
        )
    )
    if representative_ids is not None:
        query = query.filter(StagedSupplier.id.in_(representative_ids))
    return query.all()
```

Update `_get_embedding_neighbors` signature and query:

```python
def _get_embedding_neighbors(
    db: Session, supplier: StagedSupplier, source_ids: list[int], k: int,
    representative_ids: set[int] | None = None,
) -> list[int]:
```

Add filter:

```python
    query = (
        db.query(StagedSupplier.id)
        .filter(
            StagedSupplier.data_source_id != supplier.data_source_id,
            StagedSupplier.data_source_id.in_(source_ids),
            StagedSupplier.status == "active",
            StagedSupplier.name_embedding.isnot(None),
        )
    )
    if representative_ids is not None:
        query = query.filter(StagedSupplier.id.in_(representative_ids))
    neighbors = query.order_by(
        StagedSupplier.name_embedding.cosine_distance(supplier.name_embedding)
    ).limit(k).all()
    return [n.id for n in neighbors]
```

Update `embedding_block` to pass through:

```python
def embedding_block(
    db: Session, source_ids: list[int], k: int | None = None,
    representative_ids: set[int] | None = None,
) -> set[tuple[int, int]]:
```

Wire it through:

```python
    suppliers = _get_suppliers_with_embeddings(db, source_ids, representative_ids)
    # ...
    for supplier in suppliers:
        neighbor_ids = _get_embedding_neighbors(db, supplier, source_ids, k, representative_ids)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python3 -m pytest tests/test_matching_service.py::test_text_block_filters_to_representatives -v`
Expected: PASS

- [ ] **Step 6: Run all existing tests to verify no regressions**

Run: `cd backend && python3 -m pytest tests/ -x -q`
Expected: All tests pass (new param is optional with default `None`).

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/blocking.py backend/tests/test_matching_service.py
git commit -m "feat: add representative_ids filter to blocking functions"
```

---

### Task 4: Pipeline Integration — Wire Grouping into `run_matching_pipeline`

**Files:**
- Modify: `backend/app/services/matching.py:1-272`
- Modify: `backend/tests/test_matching_service.py`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_matching_service.py`:

```python
@patch("app.services.matching.embedding_block")
@patch("app.services.matching.text_block")
@patch("app.services.matching.score_pair")
def test_pipeline_groups_duplicates_reduces_candidates(
    mock_score_pair, mock_text_block, mock_embedding_block, test_db
):
    """Pipeline with intra-source duplicates produces fewer candidates than raw rows."""
    src1 = _make_source(test_db, "TTEI")
    src2 = _make_source(test_db, "EOT")
    batch1 = _make_batch(test_db, src1)
    batch2 = _make_batch(test_db, src2)

    # src1: 3 duplicates with same normalized name
    s1a = _make_supplier(test_db, batch1, src1, "Acme Corp", normalized_name="ACME CORP")
    s1b = _make_supplier(test_db, batch1, src1, "Acme Corp", normalized_name="ACME CORP")
    s1c = _make_supplier(test_db, batch1, src1, "Acme Corp", normalized_name="ACME CORP")
    # src2: 1 row
    s2 = _make_supplier(test_db, batch2, src2, "Acme Corporation", normalized_name="ACME CORPORATION")
    test_db.flush()

    # Blocking should be called with representative_ids.
    # After grouping, only 1 representative from src1 + s2 = 2 suppliers for blocking.
    def fake_text_block(db, source_ids, representative_ids=None):
        # Verify representative_ids was passed and contains only reps
        assert representative_ids is not None
        # Should have s2 + one rep from src1 (not all 3)
        src1_reps = {rid for rid in representative_ids if rid in {s1a.id, s1b.id, s1c.id}}
        assert len(src1_reps) == 1, f"Expected 1 src1 rep, got {len(src1_reps)}"
        rep_id = src1_reps.pop()
        return {(min(rep_id, s2.id), max(rep_id, s2.id))}

    mock_text_block.side_effect = fake_text_block
    mock_embedding_block.return_value = set()
    mock_score_pair.return_value = {
        "confidence": 0.85,
        "signals": {
            "jaro_winkler": 0.9, "token_jaccard": 0.8, "embedding_cosine": 0.7,
            "short_name_match": 0.5, "currency_match": 0.5, "contact_match": 0.5,
        },
    }

    from app.services.matching import run_matching_pipeline

    stats = run_matching_pipeline(test_db, batch1.id)
    test_db.flush()

    # Only 1 candidate (rep vs s2), not 3 (s1a vs s2, s1b vs s2, s1c vs s2)
    assert stats["candidate_count"] == 1


@patch("app.services.matching.embedding_block")
@patch("app.services.matching.text_block")
def test_pipeline_grouping_progress_callback(
    mock_text_block, mock_embedding_block, test_db
):
    """Progress callback includes GROUPING stage."""
    src1 = _make_source(test_db, "TTEI")
    src2 = _make_source(test_db, "EOT")
    batch1 = _make_batch(test_db, src1)
    batch2 = _make_batch(test_db, src2)
    _make_supplier(test_db, batch1, src1, "Acme Corp")
    _make_supplier(test_db, batch2, src2, "Zephyr")
    test_db.flush()

    mock_text_block.return_value = set()
    mock_embedding_block.return_value = set()

    callback = MagicMock()

    from app.services.matching import run_matching_pipeline

    run_matching_pipeline(test_db, batch1.id, progress_callback=callback)

    called_stages = [call[0][0] for call in callback.call_args_list]
    assert "GROUPING" in called_stages
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python3 -m pytest tests/test_matching_service.py::test_pipeline_groups_duplicates_reduces_candidates tests/test_matching_service.py::test_pipeline_grouping_progress_callback -v`
Expected: FAIL — `text_block` not called with `representative_ids`, no "GROUPING" stage.

- [ ] **Step 3: Modify `run_matching_pipeline`**

In `backend/app/services/matching.py`:

1. Add import at top:

```python
from sqlalchemy import or_
from app.services.grouping import group_intra_source
```

2. Update docstring to mention new step.

3. After `source_ids = _get_active_source_ids(db, batch_id)` (line 121), add grouping step and move the early exit:

```python
    # Get all active source IDs
    source_ids = _get_active_source_ids(db, batch_id)

    # Step 0.5: Intra-source grouping (runs even for single-source uploads)
    _report("GROUPING", 0)
    grouping_stats = group_intra_source(db, source_ids)
    _report("GROUPING", 100)
    logger.info("Intra-source grouping: %s", grouping_stats)

    if len(source_ids) < 2:
        logger.info("Fewer than 2 sources — skipping matching for batch %d", batch_id)
        return {"candidate_count": 0, "group_count": 0}

    # Compute representative set (grouped reps + ungrouped singles)
    reps = db.query(StagedSupplier.id).filter(
        StagedSupplier.data_source_id.in_(source_ids),
        StagedSupplier.status == "active",
        or_(
            StagedSupplier.intra_source_group_id == StagedSupplier.id,
            StagedSupplier.intra_source_group_id.is_(None),
        ),
    )
    representative_ids = {r.id for r in reps}
    logger.info("Representatives: %d out of total active suppliers", len(representative_ids))
```

4. Pass `representative_ids` to blocking calls (lines 129-131):

```python
    text_pairs = text_block(db, source_ids, representative_ids=representative_ids)
    try:
        emb_pairs = embedding_block(db, source_ids, representative_ids=representative_ids)
```

5. Replace the `all_active_suppliers` query for signal weights (lines 147-154) to use only representatives:

```python
    # Compute dynamic signal weights based on representatives only
    rep_suppliers = (
        db.query(StagedSupplier)
        .filter(StagedSupplier.id.in_(representative_ids))
        .all()
    )
    signal_weights = compute_signal_weights(rep_suppliers)
```

- [ ] **Step 4: Run the new tests**

Run: `cd backend && python3 -m pytest tests/test_matching_service.py::test_pipeline_groups_duplicates_reduces_candidates tests/test_matching_service.py::test_pipeline_grouping_progress_callback -v`
Expected: PASS

- [ ] **Step 5: Run all tests**

Run: `cd backend && python3 -m pytest tests/ -x -q`
Expected: All pass. Existing tests use `MagicMock` for `text_block`/`embedding_block` which accept any arguments, and stage assertions use `in` checks — no modifications needed to existing tests.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/matching.py backend/tests/test_matching_service.py
git commit -m "feat: wire intra-source grouping into matching pipeline"
```

---

### Task 5: Merge Expansion — Include Group Members in Unified Record

**Files:**
- Modify: `backend/app/services/merge.py:195-237`
- Modify: `backend/tests/test_review_merge.py`

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_review_merge.py`:

```python
def test_merge_expands_group_members(test_db):
    """Merging grouped reps includes all group members in source_supplier_ids."""
    src1 = _make_source(test_db, "TTEI")
    src2 = _make_source(test_db, "EOT")
    batch1 = _make_batch(test_db, src1)
    batch2 = _make_batch(test_db, src2)

    # src1: 3 rows grouped under s1a as representative
    s1a = _make_supplier(test_db, batch1, src1, "Acme Corp", currency="TND")
    s1b = _make_supplier(test_db, batch1, src1, "Acme Corp")
    s1c = _make_supplier(test_db, batch1, src1, "Acme Corp")
    s1a.intra_source_group_id = s1a.id
    s1b.intra_source_group_id = s1a.id
    s1c.intra_source_group_id = s1a.id

    # src2: single ungrouped row — same name so no conflict in merge
    s2 = _make_supplier(test_db, batch2, src2, "Acme Corp", currency="TND")
    test_db.flush()

    candidate = _make_candidate(test_db, s1a, s2)
    test_db.flush()

    unified = execute_merge(
        db=test_db,
        candidate=candidate,
        supplier_a=s1a,
        supplier_b=s2,
        source_a_name="TTEI",
        source_b_name="EOT",
        field_selections=[],
        username="reviewer",
    )
    test_db.flush()

    # source_supplier_ids should include all 3 TTEI members + EOT row
    assert set(unified.source_supplier_ids) == {s1a.id, s1b.id, s1c.id, s2.id}


def test_merge_ungrouped_backward_compat(test_db):
    """Merging ungrouped suppliers keeps source_supplier_ids as [a, b]."""
    src1 = _make_source(test_db, "TTEI")
    src2 = _make_source(test_db, "EOT")
    batch1 = _make_batch(test_db, src1)
    batch2 = _make_batch(test_db, src2)

    # Both ungrouped (intra_source_group_id is None) — same name so no conflict
    s1 = _make_supplier(test_db, batch1, src1, "Acme Corp", currency="TND")
    s2 = _make_supplier(test_db, batch2, src2, "Acme Corp", currency="TND")
    test_db.flush()

    candidate = _make_candidate(test_db, s1, s2)
    test_db.flush()

    unified = execute_merge(
        db=test_db,
        candidate=candidate,
        supplier_a=s1,
        supplier_b=s2,
        source_a_name="TTEI",
        source_b_name="EOT",
        field_selections=[],
        username="reviewer",
    )
    test_db.flush()

    assert set(unified.source_supplier_ids) == {s1.id, s2.id}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python3 -m pytest tests/test_review_merge.py::test_merge_expands_group_members tests/test_review_merge.py::test_merge_ungrouped_backward_compat -v`
Expected: `test_merge_expands_group_members` FAILS — `source_supplier_ids` is `[s1a.id, s2.id]`, missing s1b and s1c.

- [ ] **Step 3: Implement `_expand_group_members` and wire into `execute_merge`**

In `backend/app/services/merge.py`:

1. Add import for `StagedSupplier` if not already imported (it already is at line 8).

2. Add helper before `execute_merge`:

```python
def _expand_group_members(db: Session, supplier_id: int) -> list[int]:
    """Return all StagedSupplier IDs in the same intra-source group."""
    supplier = db.get(StagedSupplier, supplier_id)
    if supplier is None:
        return [supplier_id]
    group_id = supplier.intra_source_group_id
    if group_id is None:
        return [supplier_id]
    member_ids = (
        db.query(StagedSupplier.id)
        .filter(StagedSupplier.intra_source_group_id == group_id)
        .all()
    )
    return [m.id for m in member_ids]
```

3. In `execute_merge`, replace line 209:

```python
        source_supplier_ids=[supplier_a.id, supplier_b.id],
```

with:

```python
        source_supplier_ids=(
            _expand_group_members(db, supplier_a.id)
            + _expand_group_members(db, supplier_b.id)
        ),
```

4. Update the audit log at line 230:

```python
            "source_supplier_ids": (
                _expand_group_members(db, supplier_a.id)
                + _expand_group_members(db, supplier_b.id)
            ),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python3 -m pytest tests/test_review_merge.py::test_merge_expands_group_members tests/test_review_merge.py::test_merge_ungrouped_backward_compat -v`
Expected: Both PASS.

- [ ] **Step 5: Run all tests**

Run: `cd backend && python3 -m pytest tests/ -x -q`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/merge.py backend/tests/test_review_merge.py
git commit -m "feat: expand intra-source group members in merge"
```

---

### Task 6: Singleton Filtering — Exclude Non-Representative Members

**Files:**
- Modify: `backend/app/routers/unified.py:258-277`

- [ ] **Step 1: Modify the singleton query**

In `backend/app/routers/unified.py`, in the `list_singletons` function, after the existing filter `.filter(StagedSupplier.status == "active")` (line 276), add:

```python
        # Exclude non-representative group members (they're handled via their rep)
        .filter(
            or_(
                StagedSupplier.intra_source_group_id.is_(None),
                StagedSupplier.intra_source_group_id == StagedSupplier.id,
            )
        )
```

Add `or_` to the existing sqlalchemy import at line 9 of `unified.py`: `from sqlalchemy import func, case, or_`

- [ ] **Step 2: Write a test for singleton filtering**

Add to `backend/tests/test_review_merge.py` (requires `authenticated_client` fixture):

```python
def test_singleton_list_excludes_non_representative_members(authenticated_client, test_db):
    """Non-representative group members should not appear in singleton list."""
    src = _make_source(test_db, "TTEI")
    batch = _make_batch(test_db, src)
    s1 = _make_supplier(test_db, batch, src, "Acme Corp")
    s2 = _make_supplier(test_db, batch, src, "Acme Corp")
    s1.intra_source_group_id = s1.id   # representative
    s2.intra_source_group_id = s1.id   # non-representative
    test_db.flush()
    test_db.commit()

    resp = authenticated_client.get("/api/unified/singletons")
    assert resp.status_code == 200
    ids = {item["id"] for item in resp.json()["items"]}
    assert s1.id in ids       # representative appears
    assert s2.id not in ids   # non-rep excluded
```

- [ ] **Step 3: Run all tests to verify they pass**

Run: `cd backend && python3 -m pytest tests/ -x -q`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/unified.py backend/tests/test_review_merge.py
git commit -m "feat: exclude non-representative group members from singleton list"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `cd backend && python3 -m pytest tests/ -v`
Expected: All tests pass, including new grouping tests, extended matching tests, extended merge tests.

- [ ] **Step 2: Verify test count increased**

Expected: ~215+ tests (was 202 before, we added ~13 new tests).

- [ ] **Step 3: Run migration against dev database**

Run: `cd backend && ENV_PROFILE=dev alembic upgrade head`
Expected: Migration 006 applies successfully.

- [ ] **Step 4: Commit any remaining fixes**

If any tests needed adjustment, commit those fixes.
