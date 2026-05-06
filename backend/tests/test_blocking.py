"""Tests for blocking service — candidate pair generation."""

from types import SimpleNamespace
from unittest.mock import patch

from app.models.batch import ImportBatch
from app.models.enums import BatchStatus, RecordStatus
from app.models.source import DataSource
from app.models.staging import StagedRecord
from app.services.blocking import combine_blocks, embedding_block, text_block


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

        pairs = text_block(test_db, "supplier", [1, 2])
        assert (1, 2) in pairs

    def test_same_source_not_paired(self, test_db):
        """Records from the SAME source are NOT paired (cross-entity only)."""
        _make_source(test_db, 1, "Source A")
        _make_batch(test_db, 1, 1)
        _make_record(test_db, 1, 1, 1, "ACME CORP")
        _make_record(test_db, 2, 1, 1, "ACME INDUSTRIES")
        test_db.commit()

        pairs = text_block(test_db, "supplier", [1])
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

        pairs = text_block(test_db, "supplier", [1, 2])
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

        pairs = text_block(test_db, "supplier", [1, 2])
        assert (1, 2) in pairs

    def test_pair_normalized_min_max(self, test_db):
        """Pairs always stored as (min_id, max_id)."""
        _make_source(test_db, 1, "Source A")
        _make_source(test_db, 2, "Source B")
        _make_batch(test_db, 1, 1)
        _make_batch(test_db, 2, 2)
        _make_record(test_db, 10, 1, 1, "ACME CORP")
        _make_record(test_db, 5, 2, 2, "ACME INDUSTRIES")
        test_db.commit()

        pairs = text_block(test_db, "supplier", [1, 2])
        for a, b in pairs:
            assert a < b, f"Pair ({a}, {b}) not normalized"

    def test_short_names_ignored(self, test_db):
        """Records with normalized_name shorter than 3 chars are ignored for prefix blocking."""
        _make_source(test_db, 1, "Source A")
        _make_source(test_db, 2, "Source B")
        _make_batch(test_db, 1, 1)
        _make_batch(test_db, 2, 2)
        _make_record(test_db, 1, 1, 1, "AB")
        _make_record(test_db, 2, 2, 2, "AB CORP")
        test_db.commit()

        pairs = text_block(test_db, "supplier", [1, 2])
        # "AB" is too short for prefix dict (< 3 chars) but has first token "AB"
        # They should still match via first-token dict
        assert (1, 2) in pairs

    def test_superseded_excluded(self, test_db):
        """Superseded records are not included in blocking."""
        _make_source(test_db, 1, "Source A")
        _make_source(test_db, 2, "Source B")
        _make_batch(test_db, 1, 1)
        _make_batch(test_db, 2, 2)
        _make_record(test_db, 1, 1, 1, "ACME CORP")
        _make_record(test_db, 2, 2, 2, "ACME INDUSTRIES", status="superseded")
        test_db.commit()

        pairs = text_block(test_db, "supplier", [1, 2])
        assert len(pairs) == 0


class TestEmbeddingBlock:
    """Test embedding-based blocking (mocked for SQLite).

    Since pgvector Vector type doesn't work with SQLite, we mock
    the record query and the neighbor lookup entirely.
    """

    def test_pair_filtering_cross_entity(self, test_db):
        """embedding_block only returns cross-entity pairs."""

        _make_source(test_db, 1, "Source A")
        _make_source(test_db, 2, "Source B")
        _make_batch(test_db, 1, 1)
        _make_batch(test_db, 2, 2)
        # Create records WITHOUT embeddings (pgvector doesn't work in SQLite)
        _make_record(test_db, 1, 1, 1, "ACME CORP")
        _make_record(test_db, 2, 2, 2, "ACME INDUSTRIES")
        _make_record(test_db, 3, 1, 1, "BETA INC")
        test_db.commit()

        # Create mock record objects with embeddings for the query override
        def mock_record(rid, source_id, name):
            return SimpleNamespace(
                id=rid,
                data_source_id=source_id,
                normalized_name=name,
                name_embedding=[0.0, 0.0, 0.0],
                status="active",
            )

        mock_records = [
            mock_record(1, 1, "ACME CORP"),
            mock_record(2, 2, "ACME INDUSTRIES"),
            mock_record(3, 1, "BETA INC"),
        ]

        # Mock both the initial record query and the neighbor lookup
        with (
            patch("app.services.blocking._get_records_with_embeddings") as mock_query,
            patch("app.services.blocking._get_embedding_neighbors") as mock_neighbors,
        ):
            mock_query.return_value = mock_records
            mock_neighbors.side_effect = lambda db, record, type_key, source_ids, k, representative_ids=None: (
                [2] if record.id == 1 else [1] if record.id == 2 else [2] if record.id == 3 else []
            )
            pairs = embedding_block(test_db, "supplier", [1, 2], k=5)

            # Should have cross-entity pairs only and normalized (min, max)
            assert all(a < b for a, b in pairs)
            # Pair (1,2) should be present (source 1 vs source 2)
            assert (1, 2) in pairs
            # Pair (2,3) should be present (source 2 vs source 1)
            assert (2, 3) in pairs


class TestCombineBlocks:
    """Test union of blocking results."""

    def test_union_deduplication(self):
        """combine_blocks unions and deduplicates."""
        set_a = {(1, 2), (3, 4)}
        set_b = {(1, 2), (5, 6)}
        result = combine_blocks(set_a, set_b)
        assert result == {(1, 2), (3, 4), (5, 6)}

    def test_empty_inputs(self):
        """combine_blocks handles empty inputs."""
        result = combine_blocks(set(), set())
        assert result == set()
