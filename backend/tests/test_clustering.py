"""Tests for clustering service — Union-Find connected components."""

import logging

from app.services.clustering import find_groups


class TestFindGroups:
    """Test Union-Find based transitive clustering."""

    def test_transitive_closure(self):
        """Given pairs [(A,B), (B,C)], returns one group {A, B, C}."""
        pairs = [(1, 2), (2, 3)]
        groups = find_groups(pairs)
        assert len(groups) == 1
        assert groups[0] == {1, 2, 3}

    def test_separate_groups(self):
        """Given pairs [(A,B), (C,D)], returns two groups."""
        pairs = [(1, 2), (3, 4)]
        groups = find_groups(pairs)
        assert len(groups) == 2
        group_sets = [g for g in groups]
        assert {1, 2} in group_sets
        assert {3, 4} in group_sets

    def test_single_pair(self):
        """Single pair (A,B) returns one group {A,B}."""
        pairs = [(1, 2)]
        groups = find_groups(pairs)
        assert len(groups) == 1
        assert groups[0] == {1, 2}

    def test_empty_pairs(self):
        """Empty pairs returns empty groups."""
        pairs = []
        groups = find_groups(pairs)
        assert len(groups) == 0

    def test_chain_five_elements(self):
        """Chain A-B-C-D-E returns one group of 5."""
        pairs = [(1, 2), (2, 3), (3, 4), (4, 5)]
        groups = find_groups(pairs)
        assert len(groups) == 1
        assert groups[0] == {1, 2, 3, 4, 5}

    def test_large_cluster_flagged(self, caplog):
        """Groups exceeding max_cluster_size are logged as warning but kept."""
        # Create a chain of 6 elements, set max to 5
        pairs = [(1, 2), (2, 3), (3, 4), (4, 5), (5, 6)]
        with caplog.at_level(logging.WARNING):
            groups = find_groups(pairs, max_cluster_size=5)

        # Group is kept intact
        assert len(groups) == 1
        assert groups[0] == {1, 2, 3, 4, 5, 6}
        # Warning was logged
        assert any("6" in record.message and "exceed" in record.message.lower() for record in caplog.records)

    def test_within_size_no_warning(self, caplog):
        """Groups within max_cluster_size produce no warning."""
        pairs = [(1, 2), (2, 3)]
        with caplog.at_level(logging.WARNING):
            groups = find_groups(pairs, max_cluster_size=10)
        assert len(groups) == 1
        # No warnings about cluster size
        assert not any("exceed" in record.message.lower() for record in caplog.records)

    def test_complex_topology(self):
        """Complex topology with multiple connected components."""
        pairs = [
            (1, 2),
            (2, 3),  # Group 1: {1,2,3}
            (4, 5),  # Group 2: {4,5}
            (6, 7),
            (7, 8),
            (8, 9),  # Group 3: {6,7,8,9}
        ]
        groups = find_groups(pairs)
        assert len(groups) == 3
        group_sets = [g for g in groups]
        assert {1, 2, 3} in group_sets
        assert {4, 5} in group_sets
        assert {6, 7, 8, 9} in group_sets

    def test_duplicate_pairs_handled(self):
        """Duplicate pairs don't create extra groups."""
        pairs = [(1, 2), (1, 2), (2, 3)]
        groups = find_groups(pairs)
        assert len(groups) == 1
        assert groups[0] == {1, 2, 3}
