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
