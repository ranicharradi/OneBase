"""Clustering service — Union-Find connected components for transitive match groups.

Uses Union-Find (disjoint set) with path compression and union by rank
to efficiently find connected components from candidate pairs.
"""

import logging
from collections import defaultdict

from app.config import settings

logger = logging.getLogger(__name__)


class _UnionFind:
    """Union-Find (Disjoint Set) with path compression and union by rank."""

    def __init__(self):
        self.parent: dict[int, int] = {}
        self.rank: dict[int, int] = {}

    def find(self, x: int) -> int:
        """Find root with path compression."""
        if x not in self.parent:
            self.parent[x] = x
            self.rank[x] = 0
        if self.parent[x] != x:
            self.parent[x] = self.find(self.parent[x])
        return self.parent[x]

    def union(self, x: int, y: int) -> None:
        """Union by rank."""
        rx, ry = self.find(x), self.find(y)
        if rx == ry:
            return
        if self.rank[rx] < self.rank[ry]:
            rx, ry = ry, rx
        self.parent[ry] = rx
        if self.rank[rx] == self.rank[ry]:
            self.rank[rx] += 1


def find_groups(
    pairs: list[tuple[int, int]],
    max_cluster_size: int | None = None,
) -> list[set[int]]:
    """Find connected components (transitive match groups) from candidate pairs.

    Uses Union-Find with path compression and union by rank.

    Args:
        pairs: List of (supplier_a_id, supplier_b_id) tuples.
        max_cluster_size: Maximum allowed cluster size before warning
            (defaults to settings.matching_max_cluster_size).

    Returns:
        List of sets, each containing supplier IDs in a connected component.
        Groups exceeding max_cluster_size are kept but logged as warnings.
    """
    if max_cluster_size is None:
        max_cluster_size = settings.matching_max_cluster_size

    if not pairs:
        return []

    uf = _UnionFind()

    for a, b in pairs:
        uf.union(a, b)

    # Collect connected components
    components: dict[int, set[int]] = defaultdict(set)
    for node in uf.parent:
        root = uf.find(node)
        components[root].add(node)

    groups = list(components.values())

    # Flag oversized clusters
    for group in groups:
        if len(group) > max_cluster_size:
            logger.warning(
                "Cluster of size %d exceeds max_cluster_size %d — group kept but flagged for review",
                len(group),
                max_cluster_size,
            )

    logger.info("find_groups: %d groups from %d pairs", len(groups), len(pairs))
    return groups
