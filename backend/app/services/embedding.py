"""Embedding computation service using sentence-transformers."""

import numpy as np

_model = None


def get_embedding_model():
    """Load all-MiniLM-L6-v2 on first call, return cached instance.

    Lazy-loaded singleton to avoid loading the model at import time.
    """
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer

        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def compute_embeddings(names: list[str], batch_size: int = 64) -> np.ndarray:
    """Compute 384-dim embeddings for a list of names.

    Args:
        names: List of normalized supplier names.
        batch_size: Batch size for encoding (default 64).

    Returns:
        np.ndarray of shape (N, 384) with L2-normalized vectors.
        Returns empty (0, 384) array for empty input.
    """
    if not names:
        return np.empty((0, 384), dtype=np.float32)

    model = get_embedding_model()
    embeddings = model.encode(
        names,
        batch_size=batch_size,
        normalize_embeddings=True,  # L2 normalize for cosine similarity
        show_progress_bar=False,
    )
    return np.array(embeddings, dtype=np.float32)
