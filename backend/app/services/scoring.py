"""Scoring service — multi-signal supplier pair scoring.

Computes 6 signals for any supplier pair and a weighted confidence score:
1. jaro_winkler: Jaro-Winkler similarity on normalized_name
2. token_jaccard: Token set ratio on normalized_name (via rapidfuzz)
3. embedding_cosine: Cosine similarity from embeddings (dot product for L2-normalized)
4. short_name_match: Exact match on short_name
5. currency_match: Case-insensitive match on currency
6. contact_match: Jaro-Winkler similarity on contact_name
"""

import numpy as np
from rapidfuzz import fuzz
from rapidfuzz.distance import JaroWinkler

from app.config import settings
from app.models.staging import StagedSupplier


def _embedding_to_array(embedding) -> np.ndarray | None:
    """Convert embedding to numpy array, handling various storage formats."""
    if embedding is None:
        return None
    if isinstance(embedding, np.ndarray):
        return embedding
    if isinstance(embedding, (bytes, bytearray)):
        return np.frombuffer(embedding, dtype=np.float32)
    if isinstance(embedding, (list, tuple)):
        return np.array(embedding, dtype=np.float32)
    return None


_MIN_COVERAGE = 0.20


def compute_signal_weights(suppliers: list) -> dict[str, float]:
    """Compute dynamic signal weights based on field coverage and cardinality.

    Core signals (jaro_winkler, token_jaccard, embedding_cosine) are always
    included. Optional signals (short_name_match, currency_match, contact_match)
    are included only if the underlying field has sufficient coverage (>20% non-null)
    and cardinality (>1 distinct value).

    Weights are redistributed proportionally among active signals so they sum to 1.0.
    """
    if not suppliers:
        return {
            "jaro_winkler": settings.matching_weight_jaro_winkler,
            "token_jaccard": settings.matching_weight_token_jaccard,
            "embedding_cosine": settings.matching_weight_embedding_cosine,
            "short_name_match": settings.matching_weight_short_name,
            "currency_match": settings.matching_weight_currency,
            "contact_match": settings.matching_weight_contact,
        }

    total = len(suppliers)

    # Core signals always active
    active_weights = {
        "jaro_winkler": settings.matching_weight_jaro_winkler,
        "token_jaccard": settings.matching_weight_token_jaccard,
        "embedding_cosine": settings.matching_weight_embedding_cosine,
    }

    optional_signals = [
        ("short_name_match", "short_name", settings.matching_weight_short_name),
        ("currency_match", "currency", settings.matching_weight_currency),
        ("contact_match", "contact_name", settings.matching_weight_contact),
    ]

    for signal_name, field_name, default_weight in optional_signals:
        values = [getattr(s, field_name, None) for s in suppliers]
        non_null = [v for v in values if v is not None and str(v).strip()]
        coverage = len(non_null) / total if total > 0 else 0.0

        if coverage < _MIN_COVERAGE:
            active_weights[signal_name] = 0.0
            continue

        # Single distinct value has no discriminative power
        distinct = set(str(v).strip().lower() for v in non_null)
        if len(distinct) <= 1:
            active_weights[signal_name] = 0.0
            continue

        active_weights[signal_name] = default_weight

    # Normalize weights to sum to 1.0
    total_weight = sum(active_weights.values())
    if total_weight > 0:
        active_weights = {k: v / total_weight for k, v in active_weights.items()}

    return active_weights


def score_pair(
    supplier_a: StagedSupplier,
    supplier_b: StagedSupplier,
    weights: dict[str, float] | None = None,
) -> dict:
    """Compute all 6 scoring signals and weighted confidence for a supplier pair.

    Args:
        supplier_a: First supplier.
        supplier_b: Second supplier.
        weights: Optional signal weights dict (from compute_signal_weights).
                 Falls back to settings defaults if not provided.

    Returns:
        dict with 'confidence' (float 0-1) and 'signals' dict with all 6 signal scores.
    """
    name_a = supplier_a.normalized_name or ""
    name_b = supplier_b.normalized_name or ""

    # Signal 1: Jaro-Winkler similarity on normalized name
    jaro_winkler = JaroWinkler.similarity(name_a, name_b)

    # Signal 2: Token set ratio (returns 0-100, normalize to 0-1)
    token_jaccard = fuzz.token_set_ratio(name_a, name_b) / 100.0

    # Signal 3: Embedding cosine similarity
    emb_a = _embedding_to_array(supplier_a.name_embedding)
    emb_b = _embedding_to_array(supplier_b.name_embedding)
    if emb_a is not None and emb_b is not None:
        # Embeddings are L2-normalized, so dot product = cosine similarity
        embedding_cosine = float(np.dot(emb_a, emb_b))
        # Clamp to [0, 1] — cosine sim can be slightly negative for orthogonal vectors
        embedding_cosine = max(0.0, min(1.0, embedding_cosine))
    else:
        embedding_cosine = 0.5  # Neutral when missing

    # Signal 4: Short name exact match
    sn_a = supplier_a.short_name
    sn_b = supplier_b.short_name
    short_name_match = (1.0 if sn_a == sn_b else 0.0) if sn_a is not None and sn_b is not None else 0.5

    # Signal 5: Currency match (case-insensitive)
    cur_a = supplier_a.currency
    cur_b = supplier_b.currency
    if cur_a is not None and cur_b is not None:
        currency_match = 1.0 if cur_a.upper() == cur_b.upper() else 0.0
    else:
        currency_match = 0.5  # Neutral when missing

    # Signal 6: Contact name similarity
    con_a = supplier_a.contact_name
    con_b = supplier_b.contact_name
    contact_match = JaroWinkler.similarity(con_a, con_b) if con_a is not None and con_b is not None else 0.5

    signals = {
        "jaro_winkler": jaro_winkler,
        "token_jaccard": token_jaccard,
        "embedding_cosine": embedding_cosine,
        "short_name_match": short_name_match,
        "currency_match": currency_match,
        "contact_match": contact_match,
    }

    # Weighted confidence score
    w = weights or {
        "jaro_winkler": settings.matching_weight_jaro_winkler,
        "token_jaccard": settings.matching_weight_token_jaccard,
        "embedding_cosine": settings.matching_weight_embedding_cosine,
        "short_name_match": settings.matching_weight_short_name,
        "currency_match": settings.matching_weight_currency,
        "contact_match": settings.matching_weight_contact,
    }

    confidence = (
        jaro_winkler * w.get("jaro_winkler", 0.0)
        + token_jaccard * w.get("token_jaccard", 0.0)
        + embedding_cosine * w.get("embedding_cosine", 0.0)
        + short_name_match * w.get("short_name_match", 0.0)
        + currency_match * w.get("currency_match", 0.0)
        + contact_match * w.get("contact_match", 0.0)
    )

    return {
        "confidence": confidence,
        "signals": signals,
    }
