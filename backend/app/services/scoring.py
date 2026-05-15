"""Scoring service — multi-signal record-pair scoring driven by RecordType config.

The matcher reads each type's `signals` list and dispatches each Signal.kind
to a function in the SIGNAL_FNS dict. Signals that return None (one or both sides
missing the field) are dropped from the weighted sum. Confidence is divided by the
*total* configured weight (not just the active subset) so that pairs with few
firing signals cannot reach 1.0 on a single weak signal match (e.g. same currency
alone would renormalize to 1.0 otherwise).
"""

from collections.abc import Callable
from typing import Any

import numpy as np
from rapidfuzz import fuzz
from rapidfuzz.distance import JaroWinkler

from app.models.staging import StagedRecord
from app.models.unified import UnifiedRecord
from app.record_types import RecordType
from app.record_types import get as get_record_type

Record = StagedRecord | UnifiedRecord


def _resolve(record: Any, field: str) -> Any:
    return record.fields.get(field) if record.fields else None


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


SIGNAL_FNS: dict[str, Callable[[Any, Any, str], float]] = {
    "jaro_winkler": _jaro_winkler,
    "token_jaccard": _token_jaccard,
    "embedding_cosine": _embedding_cosine,
    "exact_ci": _exact_ci,
    "exact": _exact,
}


def compute_signal(kind: str, record_a: Any, record_b: Any, field: str) -> float | None:
    """Compute one signal. Returns None if either side lacks the field."""
    try:
        fn = SIGNAL_FNS[kind]
    except KeyError as exc:
        raise KeyError(f"no signal kind registered under {kind!r}") from exc
    a_val = _resolve(record_a, field)
    b_val = _resolve(record_b, field)
    if a_val is None or b_val is None:
        return None
    return fn(record_a, record_b, field)


def signal_key(kind: str, field: str) -> str:
    """Stable key for a (kind, field) pair in the signals dict.

    Kept as a single string ("kind:field") so the resulting signals dict round-trips
    through JSON cleanly and is straightforward to display in the UI.
    """
    return f"{kind}:{field}"


def score_pair(
    record_a: Record,
    record_b: Record,
    record_type: RecordType | None = None,
) -> dict:
    """Compute confidence + signal breakdown for a record pair.

    `record_type` defaults to looking up by record_a.type. Both records must
    share a type — passing mismatched records is a programmer error.

    Returns a dict with:
      - 'confidence' (float 0-1): weighted average of active signals
      - 'signals' (dict[str, float]): signal contributions keyed by "{kind}:{field}"
    """
    if record_a.type != record_b.type:
        raise ValueError(f"score_pair received records of differing types: {record_a.type!r} vs {record_b.type!r}")

    rt = record_type or get_record_type(record_a.type)

    signals: dict[str, float] = {}
    weighted_score = 0.0
    total_weight = sum(sig.weight for sig in rt.signals)

    for sig in rt.signals:
        value = compute_signal(sig.kind, record_a, record_b, sig.field)
        if value is None:
            continue  # missing field — signal dropped, weight still counts against total
        signals[signal_key(sig.kind, sig.field)] = value
        weighted_score += value * sig.weight

    confidence = weighted_score / total_weight if total_weight > 0 else 0.0
    return {"confidence": confidence, "signals": signals}
