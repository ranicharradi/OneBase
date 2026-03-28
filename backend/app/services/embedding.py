"""Embedding computation service using sentence-transformers."""

import logging
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeoutError

import numpy as np

logger = logging.getLogger(__name__)

_model = None


class EmbeddingTimeoutError(Exception):
    """Raised when embedding computation exceeds the timeout."""


def get_embedding_model():
    """Load all-MiniLM-L6-v2 on first call, return cached instance.

    Lazy-loaded singleton to avoid loading the model at import time.
    """
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer

        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def compute_embeddings(names: list[str], batch_size: int = 64, timeout_seconds: int = 300) -> np.ndarray:
    """Compute 384-dim embeddings for a list of names.

    Args:
        names: List of normalized supplier names.
        batch_size: Batch size for encoding (default 64).
        timeout_seconds: Max seconds before raising EmbeddingTimeoutError (default 300).

    Returns:
        np.ndarray of shape (N, 384) with L2-normalized vectors.
        Returns empty (0, 384) array for empty input.

    Raises:
        EmbeddingTimeoutError: If encoding exceeds timeout_seconds.
    """
    if not names:
        return np.empty((0, 384), dtype=np.float32)

    model = get_embedding_model()

    def _encode():
        return model.encode(
            names,
            batch_size=batch_size,
            normalize_embeddings=True,
            show_progress_bar=False,
        )

    # NOTE: ThreadPoolExecutor unblocks the caller on timeout but cannot
    # cancel the running thread — the encode() call will finish in the
    # background. Acceptable trade-off: the batch gets marked failed and the
    # worker can pick up new tasks. True cancellation would require
    # multiprocessing (adds IPC complexity) or signal.alarm (POSIX-only).
    try:
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_encode)
            embeddings = future.result(timeout=timeout_seconds)
        return np.array(embeddings, dtype=np.float32)
    except FuturesTimeoutError:
        logger.error(
            "Embedding computation timed out after %ds for %d names",
            timeout_seconds,
            len(names),
        )
        raise EmbeddingTimeoutError(f"Embedding timed out after {timeout_seconds}s for {len(names)} names") from None
    except Exception as e:
        logger.error("Embedding computation failed: %s", e)
        raise
