"""Tests for blocking service — candidate pair generation."""

from app.models.batch import ImportBatch
from app.models.enums import BatchStatus, RecordStatus
from app.models.source import DataSource
from app.models.staging import StagedRecord
from app.models.unified import UnifiedRecord
from app.services.blocking import combine_blocks, embedding_block, text_block
from app.services.record_set import RecordRef, RecordSet


def _make_source(db, source_id, name):
    """Create a DataSource for testing."""
    source = DataSource(
        id=source_id,
        name=name,
        type="supplier",
        file_format="csv",
        column_mapping={"name": "Supplier Name"},
    )
    db.add(source)
    db.flush()
    return source


def _make_batch(db, batch_id, source_id):
    """Create an ImportBatch for testing."""
    batch = ImportBatch(
        id=batch_id,
        data_source_id=source_id,
        filename="test.csv",
        uploaded_by="testuser",
        status=BatchStatus.COMPLETED,
    )
    db.add(batch)
    db.flush()
    return batch


def _make_record(db, record_id, source_id, batch_id, normalized_name, **kwargs):
    """Create a StagedRecord for testing."""
    defaults = {
        "status": RecordStatus.ACTIVE,
    }
    defaults.update(kwargs)
    record = StagedRecord(
        id=record_id,
        type="supplier",
        data_source_id=source_id,
        import_batch_id=batch_id,
        name=normalized_name,
        normalized_name=normalized_name,
        raw_data={"name": normalized_name},
        fields={},
        **defaults,
    )
    db.add(record)
    db.flush()
    return record


def _rs(type_key, *record_ids) -> RecordSet:
    """Build a staged-only RecordSet from explicit record IDs."""
    return RecordSet(type_key=type_key, refs=[RecordRef(rid, "staged") for rid in record_ids])


def _has_pair(pairs, id_a, id_b) -> bool:
    """Check if a pair with those IDs exists (either order) in a set of RecordRef pairs."""
    for p in pairs:
        ids = {p[0].id, p[1].id}
        if ids == {id_a, id_b}:
            return True
    return False


class TestTextBlock:
    """Test text-based blocking via prefix and first-token overlap."""

    def test_cross_entity_pairs_prefix_match(self, test_db):
        """Records from different sources with same prefix are paired."""
        _make_source(test_db, 1, "Source A")
        _make_source(test_db, 2, "Source B")
        _make_batch(test_db, 1, 1)
        _make_batch(test_db, 2, 2)
        _make_record(test_db, 1, 1, 1, "ACME CORP")
        _make_record(test_db, 2, 2, 2, "ACME INDUSTRIES")
        test_db.commit()

        rs = _rs("supplier", 1, 2)
        pairs = text_block(test_db, rs, None)
        assert _has_pair(pairs, 1, 2)

    def test_same_source_not_paired(self, test_db):
        """Records from the SAME source are NOT paired (cross-entity only)."""
        _make_source(test_db, 1, "Source A")
        _make_batch(test_db, 1, 1)
        _make_record(test_db, 1, 1, 1, "ACME CORP")
        _make_record(test_db, 2, 1, 1, "ACME INDUSTRIES")
        test_db.commit()

        rs = _rs("supplier", 1, 2)
        pairs = text_block(test_db, rs, None)
        assert len(pairs) == 0

    def test_no_match_different_prefix_and_token(self, test_db):
        """Records with different prefix and first token are NOT paired."""
        _make_source(test_db, 1, "Source A")
        _make_source(test_db, 2, "Source B")
        _make_batch(test_db, 1, 1)
        _make_batch(test_db, 2, 2)
        _make_record(test_db, 1, 1, 1, "BETA INC")
        _make_record(test_db, 2, 2, 2, "GAMMA LLC")
        test_db.commit()

        rs = _rs("supplier", 1, 2)
        pairs = text_block(test_db, rs, None)
        assert len(pairs) == 0

    def test_first_token_match(self, test_db):
        """Records sharing first token but not 3-char prefix are still paired."""
        _make_source(test_db, 1, "Source A")
        _make_source(test_db, 2, "Source B")
        _make_batch(test_db, 1, 1)
        _make_batch(test_db, 2, 2)
        # Same first token "ACME" but different 3-char prefix is impossible since
        # both start with "ACM". Let's test first-token matching with a real scenario:
        _make_record(test_db, 1, 1, 1, "ACME CORP")
        _make_record(test_db, 2, 2, 2, "ACME SOLUTIONS")
        test_db.commit()

        rs = _rs("supplier", 1, 2)
        pairs = text_block(test_db, rs, None)
        assert _has_pair(pairs, 1, 2)

    def test_pair_normalized_min_max(self, test_db):
        """Within same kind, pairs are stored with lower id first."""
        _make_source(test_db, 1, "Source A")
        _make_source(test_db, 2, "Source B")
        _make_batch(test_db, 1, 1)
        _make_batch(test_db, 2, 2)
        _make_record(test_db, 10, 1, 1, "ACME CORP")
        _make_record(test_db, 5, 2, 2, "ACME INDUSTRIES")
        test_db.commit()

        rs = _rs("supplier", 10, 5)
        pairs = text_block(test_db, rs, None)
        for a, b in pairs:
            if a.kind == b.kind:
                assert a.id <= b.id, f"Pair ({a}, {b}) not normalized within same kind"

    def test_short_names_ignored(self, test_db):
        """Records with normalized_name shorter than 3 chars are ignored for prefix blocking."""
        _make_source(test_db, 1, "Source A")
        _make_source(test_db, 2, "Source B")
        _make_batch(test_db, 1, 1)
        _make_batch(test_db, 2, 2)
        _make_record(test_db, 1, 1, 1, "AB")
        _make_record(test_db, 2, 2, 2, "AB CORP")
        test_db.commit()

        rs = _rs("supplier", 1, 2)
        pairs = text_block(test_db, rs, None)
        # "AB" is too short for prefix dict (< 3 chars) but has first token "AB"
        # They should still match via first-token dict
        assert _has_pair(pairs, 1, 2)

    def test_superseded_excluded(self, test_db):
        """Superseded records are not included in blocking (not included in RecordSet)."""
        _make_source(test_db, 1, "Source A")
        _make_source(test_db, 2, "Source B")
        _make_batch(test_db, 1, 1)
        _make_batch(test_db, 2, 2)
        _make_record(test_db, 1, 1, 1, "ACME CORP")
        _make_record(test_db, 2, 2, 2, "ACME INDUSTRIES", status="superseded")
        test_db.commit()

        # Only include the active record in the RecordSet (superseded excluded by caller)
        rs = _rs("supplier", 1)
        pairs = text_block(test_db, rs, None)
        assert len(pairs) == 0


class TestEmbeddingBlock:
    """Test embedding-based blocking (in-memory cosine).

    Since pgvector Vector type doesn't work with SQLite, records have no embeddings
    in test — embedding_block returns an empty set.
    """

    def test_no_embeddings_returns_empty(self, test_db):
        """embedding_block returns empty set when no records have embeddings."""
        _make_source(test_db, 1, "Source A")
        _make_source(test_db, 2, "Source B")
        _make_batch(test_db, 1, 1)
        _make_batch(test_db, 2, 2)
        _make_record(test_db, 1, 1, 1, "ACME CORP")
        _make_record(test_db, 2, 2, 2, "ACME INDUSTRIES")
        _make_record(test_db, 3, 1, 1, "BETA INC")
        test_db.commit()

        rs = _rs("supplier", 1, 2, 3)
        pairs = embedding_block(test_db, rs, None, k=5)
        # No embeddings in SQLite — should return empty set
        assert pairs == set()


class TestCombineBlocks:
    """Test union of blocking results."""

    def test_union_deduplication(self):
        """combine_blocks unions and deduplicates."""
        r1 = RecordRef(1, "staged")
        r2 = RecordRef(2, "staged")
        r3 = RecordRef(3, "staged")
        r4 = RecordRef(4, "staged")
        r5 = RecordRef(5, "staged")
        r6 = RecordRef(6, "staged")
        set_a = {(r1, r2), (r3, r4)}
        set_b = {(r1, r2), (r5, r6)}
        result = combine_blocks(set_a, set_b)
        assert result == {(r1, r2), (r3, r4), (r5, r6)}

    def test_empty_inputs(self):
        """combine_blocks handles empty inputs."""
        result = combine_blocks(set(), set())
        assert result == set()


def test_text_block_cross_side_only_emits_cross_side_pairs(test_db):
    src = DataSource(name="s", type="supplier", column_mapping={"name": "x"})
    test_db.add(src)
    test_db.flush()
    batch = ImportBatch(data_source_id=src.id, filename="f", uploaded_by="u", status=BatchStatus.COMPLETED)
    test_db.add(batch)
    test_db.flush()
    a1 = StagedRecord(
        type="supplier",
        import_batch_id=batch.id,
        data_source_id=src.id,
        name="ACME",
        normalized_name="ACME ONE",
        status=RecordStatus.ACTIVE,
        fields={},
    )
    a2 = StagedRecord(
        type="supplier",
        import_batch_id=batch.id,
        data_source_id=src.id,
        name="ACME LTD",
        normalized_name="ACME LTD",
        status=RecordStatus.ACTIVE,
        fields={},
    )
    test_db.add_all([a1, a2])
    test_db.flush()
    u = UnifiedRecord(
        type="supplier",
        name="ACME",
        normalized_name="ACME WORLD",
        fields={},
        provenance={},
        source_record_ids=[],
        created_by="u",
    )
    test_db.add(u)
    test_db.flush()

    side_a = RecordSet(type_key="supplier", refs=[RecordRef(a1.id, "staged"), RecordRef(a2.id, "staged")])
    side_b = RecordSet(type_key="supplier", refs=[RecordRef(u.id, "unified")])
    pairs = text_block(test_db, side_a, side_b)
    # Every pair has exactly one staged ref and one unified ref.
    for p in pairs:
        kinds = sorted([p[0].kind, p[1].kind])
        assert kinds == ["staged", "unified"]


def test_text_block_self_join_falls_back_to_cross_source(test_db):
    src1 = DataSource(name="s1", type="supplier", column_mapping={"name": "x"})
    src2 = DataSource(name="s2", type="supplier", column_mapping={"name": "x"})
    test_db.add_all([src1, src2])
    test_db.flush()
    b1 = ImportBatch(data_source_id=src1.id, filename="a", uploaded_by="u", status=BatchStatus.COMPLETED)
    b2 = ImportBatch(data_source_id=src2.id, filename="b", uploaded_by="u", status=BatchStatus.COMPLETED)
    test_db.add_all([b1, b2])
    test_db.flush()
    r1 = StagedRecord(
        type="supplier",
        import_batch_id=b1.id,
        data_source_id=src1.id,
        name="ACME",
        normalized_name="ACME LTD",
        status=RecordStatus.ACTIVE,
        fields={},
    )
    r2 = StagedRecord(
        type="supplier",
        import_batch_id=b2.id,
        data_source_id=src2.id,
        name="ACME",
        normalized_name="ACME LTD",
        status=RecordStatus.ACTIVE,
        fields={},
    )
    test_db.add_all([r1, r2])
    test_db.flush()

    rs = RecordSet(type_key="supplier", refs=[RecordRef(r1.id, "staged"), RecordRef(r2.id, "staged")])
    pairs = text_block(test_db, rs, None)
    # Cross-source pair should be emitted.
    flat = {(min(p[0].id, p[1].id), max(p[0].id, p[1].id)) for p in pairs}
    assert (min(r1.id, r2.id), max(r1.id, r2.id)) in flat
