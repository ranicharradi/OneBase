"""Retraining service — compute new signal weights from reviewer decisions.

Uses a simple discriminative power approach (no sklearn dependency):
For each signal, compute the mean in confirmed vs rejected candidates.
Signals with larger positive difference get higher weight.
Normalize to sum=1.0, clamp to [0.01, 0.5] range.
"""

import logging

from sqlalchemy.orm import Session

from app.models.enums import CandidateStatus
from app.models.match import MatchCandidate

logger = logging.getLogger(__name__)

SIGNAL_KEYS = [
    "jaro_winkler",
    "token_jaccard",
    "embedding_cosine",
    "short_name_match",
    "currency_match",
    "contact_match",
]

MIN_REVIEW_COUNT = 20


def retrain_weights(db: Session) -> dict | None:
    """Compute new signal weights from confirmed/rejected match candidates.

    Args:
        db: Database session.

    Returns:
        Dict with 'weights' (signal name -> weight) and 'sample_count',
        or None if insufficient data (<20 reviewed candidates).
    """
    # Query reviewed candidates with non-null signals
    reviewed = (
        db.query(MatchCandidate)
        .filter(
            MatchCandidate.status.in_([CandidateStatus.CONFIRMED, CandidateStatus.REJECTED]),
            MatchCandidate.match_signals.isnot(None),
        )
        .all()
    )

    if len(reviewed) < MIN_REVIEW_COUNT:
        logger.info(
            "Insufficient reviewed candidates for retraining: %d < %d",
            len(reviewed),
            MIN_REVIEW_COUNT,
        )
        return None

    # Separate confirmed and rejected
    confirmed = [c for c in reviewed if c.status == CandidateStatus.CONFIRMED]
    rejected = [c for c in reviewed if c.status == CandidateStatus.REJECTED]

    if not confirmed or not rejected:
        logger.warning("Need both confirmed and rejected candidates for retraining")
        return None

    # Compute mean signal values for confirmed and rejected
    def _mean_signal(candidates: list, key: str) -> float:
        values = []
        for c in candidates:
            signals = c.match_signals
            if isinstance(signals, dict) and key in signals:
                values.append(float(signals[key]))
        return sum(values) / len(values) if values else 0.0

    # Compute discriminative power: mean_confirmed - mean_rejected
    raw_weights = {}
    for key in SIGNAL_KEYS:
        mean_conf = _mean_signal(confirmed, key)
        mean_rej = _mean_signal(rejected, key)
        # Difference represents how discriminative this signal is
        diff = mean_conf - mean_rej
        # Use absolute value + small bias to ensure positive weights
        raw_weights[key] = max(abs(diff), 0.01)

    # Normalize to sum=1.0
    total = sum(raw_weights.values())
    weights = {}
    for key in SIGNAL_KEYS:
        w = raw_weights[key] / total
        # Clamp to [0.01, 0.5]
        w = max(0.01, min(0.5, w))
        weights[key] = round(w, 4)

    # Re-normalize after clamping
    total = sum(weights.values())
    weights = {k: round(v / total, 4) for k, v in weights.items()}

    logger.info(
        "Retrained weights from %d samples (%d confirmed, %d rejected): %s",
        len(reviewed),
        len(confirmed),
        len(rejected),
        weights,
    )

    return {
        "weights": weights,
        "sample_count": len(reviewed),
    }
