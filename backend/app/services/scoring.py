"""Scoring service — multi-signal record-pair scoring driven by RecordType config.

The matcher reads each type's `signals` list and dispatches each Signal.kind
to a function in app.services.signals (the signal-kind registry). Signals that
return None (one or both sides missing the field) are dropped from the weighted
sum. Confidence is divided by the *total* configured weight (not just the active
subset) so that pairs with few firing signals cannot reach 1.0 on a single weak
signal match (e.g. same currency alone would renormalize to 1.0 otherwise).
"""

from app.models.staging import StagedRecord
from app.models.unified import UnifiedRecord
from app.record_types import RecordType
from app.record_types import get as get_record_type
from app.services.signals import compute_signal

Record = StagedRecord | UnifiedRecord


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
