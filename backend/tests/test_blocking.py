"""Tests for blocking service — candidate pair generation."""

import pytest
from unittest.mock import patch, MagicMock

from app.models.staging import StagedSupplier
from app.models.source import DataSource
from app.models.batch import ImportBatch
from app.services.blocking import text_block, embedding_block, combine_blocks


def _make_source(db, source_id, name):
    """Create a DataSource for testing."""
    source = DataSource(
        id=source_id,
        name=name,
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
        status="completed",
    )
    db.add(batch)
    db.flush()
    return batch


def _make_supplier(db, supplier_id, source_id, batch_id, normalized_name, **kwargs):
    """Create a StagedSupplier for testing."""
    supplier = StagedSupplier(
        id=supplier_id,
        data_source_id=source_id,
        import_batch_id=batch_id,
        name=normalized_name,
        normalized_name=normalized_name,
        status="active",
        raw_data={"name": normalized_name},
        **kwargs,
    )
    db.add(supplier)
    db.flush()
    return supplier


class TestTextBlock:
    """Test text-based blocking via prefix and first-token overlap."""

    def test_cross_entity_pairs_prefix_match(self, test_db):
        """Suppliers from different sources with same prefix are paired."""
        _make_source(test_db, 1, "Source A")
        _make_source(test_db, 2, "Source B")
        _make_batch(test_db, 1, 1)
        _make_batch(test_db, 2, 2)
        _make_supplier(test_db, 1, 1, 1, "ACME CORP")
        _make_supplier(test_db, 2, 2, 2, "ACME INDUSTRIES")
        test_db.commit()

        pairs = text_block(test_db, [1, 2])
        assert (1, 2) in pairs

    def test_same_source_not_paired(self, test_db):
        """Suppliers from the SAME source are NOT paired (cross-entity only)."""
        _make_source(test_db, 1, "Source A")
        _make_batch(test_db, 1, 1)
        _make_supplier(test_db, 1, 1, 1, "ACME CORP")
        _make_supplier(test_db, 2, 1, 1, "ACME INDUSTRIES")
        test_db.commit()

        pairs = text_block(test_db, [1])
        assert len(pairs) == 0

    def test_no_match_different_prefix_and_token(self, test_db):
        """Suppliers with different prefix and first token are NOT paired."""
        _make_source(test_db, 1, "Source A")
        _make_source(test_db, 2, "Source B")
        _make_batch(test_db, 1, 1)
        _make_batch(test_db, 2, 2)
        _make_supplier(test_db, 1, 1, 1, "BETA INC")
        _make_supplier(test_db, 2, 2, 2, "GAMMA LLC")
        test_db.commit()

        pairs = text_block(test_db, [1, 2])
        assert len(pairs) == 0

    def test_first_token_match(self, test_db):
        """Suppliers sharing first token but not 3-char prefix are still paired."""
        _make_source(test_db, 1, "Source A")
        _make_source(test_db, 2, "Source B")
        _make_batch(test_db, 1, 1)
        _make_batch(test_db, 2, 2)
        # Same first token "ACME" but different 3-char prefix is impossible since
        # both start with "ACM". Let's test first-token matching with a real scenario:
        _make_supplier(test_db, 1, 1, 1, "ACME CORP")
        _make_supplier(test_db, 2, 2, 2, "ACME SOLUTIONS")
        test_db.commit()

        pairs = text_block(test_db, [1, 2])
        assert (1, 2) in pairs

    def test_pair_normalized_min_max(self, test_db):
        """Pairs always stored as (min_id, max_id)."""
        _make_source(test_db, 1, "Source A")
        _make_source(test_db, 2, "Source B")
        _make_batch(test_db, 1, 1)
        _make_batch(test_db, 2, 2)
        _make_supplier(test_db, 10, 1, 1, "ACME CORP")
        _make_supplier(test_db, 5, 2, 2, "ACME INDUSTRIES")
        test_db.commit()

        pairs = text_block(test_db, [1, 2])
        for a, b in pairs:
            assert a < b, f"Pair ({a}, {b}) not normalized"

    def test_short_names_skipped(self, test_db):
        """Suppliers with normalized_name shorter than 3 chars are skipped for prefix blocking."""
        _make_source(test_db, 1, "Source A")
        _make_source(test_db, 2, "Source B")
        _make_batch(test_db, 1, 1)
        _make_batch(test_db, 2, 2)
        _make_supplier(test_db, 1, 1, 1, "AB")
        _make_supplier(test_db, 2, 2, 2, "AB CORP")
        test_db.commit()

        pairs = text_block(test_db, [1, 2])
        # "AB" is too short for prefix dict (< 3 chars) but has first token "AB"
        # They should still match via first-token dict
        assert (1, 2) in pairs

    def test_superseded_excluded(self, test_db):
        """Superseded suppliers are not included in blocking."""
        _make_source(test_db, 1, "Source A")
        _make_source(test_db, 2, "Source B")
        _make_batch(test_db, 1, 1)
        _make_batch(test_db, 2, 2)
        _make_supplier(test_db, 1, 1, 1, "ACME CORP")
        _make_supplier(test_db, 2, 2, 2, "ACME INDUSTRIES", status="superseded")
        test_db.commit()

        pairs = text_block(test_db, [1, 2])
        assert len(pairs) == 0


class TestEmbeddingBlock:
    """Test embedding-based blocking (mocked for SQLite)."""

    def test_pair_filtering_cross_entity(self, test_db):
        """embedding_block only returns cross-entity pairs."""
        import numpy as np

        _make_source(test_db, 1, "Source A")
        _make_source(test_db, 2, "Source B")
        _make_batch(test_db, 1, 1)
        _make_batch(test_db, 2, 2)
        # Create suppliers (embeddings won't work in SQLite, but we mock)
        s1 = _make_supplier(test_db, 1, 1, 1, "ACME CORP")
        s2 = _make_supplier(test_db, 2, 2, 2, "ACME INDUSTRIES")
        s3 = _make_supplier(test_db, 3, 1, 1, "BETA INC")
        test_db.commit()

        # Mock the pgvector query to return neighbors
        # The function should filter to cross-entity only
        with patch("app.services.blocking._get_embedding_neighbors") as mock_neighbors:
            # For supplier 1 (source 1), neighbors are [2 (source 2), 3 (source 1)]
            # Only (1, 2) should be returned since 3 is same source
            mock_neighbors.side_effect = lambda db, supplier, source_ids, k: (
                [2]
                if supplier.id == 1
                else [1]
                if supplier.id == 2
                else [1, 2]
                if supplier.id == 3
                else []
            )
            pairs = embedding_block(test_db, [1, 2], k=5)
            # Should have cross-entity pairs only
            assert all(a < b for a, b in pairs)
            # Pair (1,2) should be present (cross-entity)
            assert (1, 2) in pairs
            # Pair (1,3) should NOT be present (same source)
            assert (1, 3) not in pairs


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
