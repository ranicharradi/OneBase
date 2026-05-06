"""Built-in signal kinds. Imported for side effect — registers each kind."""

from typing import Any

import numpy as np
from rapidfuzz import fuzz
from rapidfuzz.distance import JaroWinkler

from app.services.signals.registry import _resolve, register_kind


def _embedding_to_array(embedding: Any) -> np.ndarray | None:
    if embedding is None:
        return None
    if isinstance(embedding, np.ndarray):
        return embedding
    if isinstance(embedding, (bytes, bytearray)):
        return np.frombuffer(embedding, dtype=np.float32)
    if isinstance(embedding, (list, tuple)):
        return np.array(embedding, dtype=np.float32)
    return None


def _jaro_winkler(a: Any, b: Any, field: str) -> float:
    av = _resolve(a, field)
    bv = _resolve(b, field)
    return JaroWinkler.similarity(str(av), str(bv))


def _token_jaccard(a: Any, b: Any, field: str) -> float:
    av = _resolve(a, field)
    bv = _resolve(b, field)
    return fuzz.token_set_ratio(str(av), str(bv)) / 100.0


def _embedding_cosine(a: Any, b: Any, field: str) -> float:
    """Reads `record.name_embedding` directly. The `field` arg is purely declarative;
    RecordType validation in base.py enforces that any `embedding_cosine` signal
    points at the NAME-role field.
    """
    emb_a = _embedding_to_array(getattr(a, "name_embedding", None))
    emb_b = _embedding_to_array(getattr(b, "name_embedding", None))
    if emb_a is None or emb_b is None:
        return 0.5  # neutral when missing — preserves today's behavior
    score = float(np.dot(emb_a, emb_b))
    return max(0.0, min(1.0, score))


def _exact_ci(a: Any, b: Any, field: str) -> float:
    av = _resolve(a, field)
    bv = _resolve(b, field)
    return 1.0 if str(av).strip().upper() == str(bv).strip().upper() else 0.0


def _exact(a: Any, b: Any, field: str) -> float:
    av = _resolve(a, field)
    bv = _resolve(b, field)
    return 1.0 if str(av).strip() == str(bv).strip() else 0.0


register_kind("jaro_winkler", _jaro_winkler)
register_kind("token_jaccard", _token_jaccard)
register_kind("embedding_cosine", _embedding_cosine)
register_kind("exact_ci", _exact_ci)
register_kind("exact", _exact)
