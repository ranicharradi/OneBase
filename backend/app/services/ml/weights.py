"""Retraining service — compute new signal weights from reviewer decisions, per record type.

Uses a discriminative-power approach: for each signal in the type's signal vector,
compute mean in confirmed vs rejected. Bigger positive difference → higher weight.
Normalize to sum=1.0, clamp to [0.01, 0.5].
"""

import logging

from sqlalchemy.orm import Session

from app.models.enums import CandidateStatus
from app.models.match import MatchCandidate
from app.record_types import get as get_record_type
from app.services.scoring import signal_key

logger = logging.getLogger(__name__)

MIN_REVIEW_COUNT = 20


def retrain_weights(db: Session, record_type_key: str) -> dict | None:
    """Compute new signal weights from confirmed/rejected match candidates of a type.

    Returns:
        Dict with 'weights' ({signal_key: weight}), 'sample_count', and 'record_type',
        or None if insufficient data (<20 reviewed candidates).
    """
    rt = get_record_type(record_type_key)
    signal_keys = [signal_key(s.kind, s.field) for s in rt.signals]

    reviewed = (
        db.query(MatchCandidate)
        .filter(
            MatchCandidate.type == record_type_key,
            MatchCandidate.status.in_([CandidateStatus.CONFIRMED, CandidateStatus.REJECTED]),
            MatchCandidate.match_signals.isnot(None),
        )
        .all()
    )

    if len(reviewed) < MIN_REVIEW_COUNT:
        logger.info(
            "Insufficient reviewed candidates for retraining (type=%s): %d < %d",
            record_type_key,
            len(reviewed),
            MIN_REVIEW_COUNT,
        )
        return None

    confirmed = [c for c in reviewed if c.status == CandidateStatus.CONFIRMED]
    rejected = [c for c in reviewed if c.status == CandidateStatus.REJECTED]
    if not confirmed or not rejected:
        logger.warning(
            "Need both confirmed and rejected candidates for retraining (type=%s)",
            record_type_key,
        )
        return None

    def _mean_signal(candidates: list, key: str) -> float:
        values = []
        for c in candidates:
            signals = c.match_signals
            if isinstance(signals, dict) and key in signals:
                values.append(float(signals[key]))
        return sum(values) / len(values) if values else 0.0

    raw_weights = {}
    for key in signal_keys:
        diff = _mean_signal(confirmed, key) - _mean_signal(rejected, key)
        raw_weights[key] = max(abs(diff), 0.01)

    total = sum(raw_weights.values())
    weights = {}
    for key in signal_keys:
        w = raw_weights[key] / total
        w = max(0.01, min(0.5, w))
        weights[key] = round(w, 4)

    total = sum(weights.values())
    weights = {k: round(v / total, 4) for k, v in weights.items()}

    logger.info(
        "Retrained weights from %d samples (%d confirmed, %d rejected) for type %s: %s",
        len(reviewed),
        len(confirmed),
        len(rejected),
        record_type_key,
        weights,
    )

    return {
        "weights": weights,
        "sample_count": len(reviewed),
        "record_type": record_type_key,
    }
