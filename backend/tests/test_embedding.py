"""Tests for embedding computation service."""

import time
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from app.services.embedding import EmbeddingTimeoutError, compute_embeddings


class TestComputeEmbeddings:
    """Tests for compute_embeddings function."""

    def test_output_shape(self, test_db):
        """Returns ndarray of shape (N, 384)."""
        names = ["ACME CORP", "BETA LTD", "GAMMA INC"]
        # Mock the model since sentence-transformers may not be installed
        mock_model = MagicMock()
        mock_model.encode.return_value = np.random.randn(3, 384).astype(np.float32)
        with patch("app.services.embedding.get_embedding_model", return_value=mock_model):
            result = compute_embeddings(names)
        assert isinstance(result, np.ndarray)
        assert result.shape == (3, 384)

    def test_empty_list_returns_empty_array(self, test_db):
        """Empty input returns empty (0, 384) array."""
        result = compute_embeddings([])
        assert isinstance(result, np.ndarray)
        assert result.shape == (0, 384)

    def test_l2_normalization(self, test_db):
        """Each vector has approximately unit length (L2 normalized)."""
        names = ["ACME CORP", "BETA LTD"]
        # Create mock embeddings with known values (not normalized)
        raw_embeddings = np.array([[1.0, 2.0, 3.0] + [0.0] * 381, [4.0, 5.0, 6.0] + [0.0] * 381], dtype=np.float32)
        # The model.encode with normalize_embeddings=True should return normalized vectors
        norms = np.linalg.norm(raw_embeddings, axis=1, keepdims=True)
        normalized = raw_embeddings / norms

        mock_model = MagicMock()
        mock_model.encode.return_value = normalized
        with patch("app.services.embedding.get_embedding_model", return_value=mock_model):
            result = compute_embeddings(names)

        # Verify each vector has unit length
        for vec in result:
            norm = np.linalg.norm(vec)
            assert abs(norm - 1.0) < 0.01, f"Expected unit length, got {norm}"


class TestEmbeddingTimeout:
    """Tests for embedding computation timeout."""

    def test_timeout_raises_error(self, test_db):
        """Embedding computation raises EmbeddingTimeoutError on timeout."""

        def slow_encode(*args, **kwargs):
            time.sleep(5)
            return np.zeros((1, 384), dtype=np.float32)

        mock_model = MagicMock()
        mock_model.encode.side_effect = slow_encode

        with (
            patch("app.services.embedding.get_embedding_model", return_value=mock_model),
            pytest.raises(EmbeddingTimeoutError, match="timed out"),
        ):
            compute_embeddings(["test name"], timeout_seconds=1)

    def test_normal_encoding_still_works(self, test_db):
        """Normal encoding works within timeout."""
        mock_model = MagicMock()
        mock_model.encode.return_value = np.random.randn(2, 384).astype(np.float32)

        with patch("app.services.embedding.get_embedding_model", return_value=mock_model):
            result = compute_embeddings(["name1", "name2"], timeout_seconds=30)

        assert result.shape == (2, 384)

    def test_general_exception_propagates(self, test_db):
        """Non-timeout exceptions propagate as-is."""
        mock_model = MagicMock()
        mock_model.encode.side_effect = RuntimeError("Model exploded")

        with (
            patch("app.services.embedding.get_embedding_model", return_value=mock_model),
            pytest.raises(RuntimeError, match="Model exploded"),
        ):
            compute_embeddings(["test"])
