"""ML scoring service — inference with trained LightGBM models, type-aware.

Public functions:
- ml_score_pair: score a record pair with the scorer model for the pair's type
- blocker_filter: pre-filter candidate pairs with the blocker model for one type
"""

import numpy as np
from rapidfuzz import fuzz
from rapidfuzz.distance import JaroWinkler

from app.models.staging import StagedRecord
from app.services.ml_training import (
    ModelBundle,
    _build_scorer_row,
    _compute_engineered_features,
)
from app.services.record_set import RecordRef


def ml_score_pair(
    record_a: StagedRecord,
    record_b: StagedRecord,
    bundle: ModelBundle,
) -> dict:
    """Score a pair using the scorer ML model.

    The bundle must be trained on the same record type as the records.
    """
    if record_a.type != bundle.record_type or record_b.type != bundle.record_type:
        raise ValueError(
            f"ml_score_pair: model trained for {bundle.record_type!r}, "
            f"got records of type {record_a.type!r}/{record_b.type!r}"
        )

    # We always need the per-signal dict, so compute it first via the weighted scorer.
    # The LightGBM model then re-scores from the same signals; this is intentional.
    from app.services.scoring import score_pair as weighted_score_pair

    base_result = weighted_score_pair(record_a, record_b)
    signals = base_result["signals"]

    feature_row = _build_scorer_row(record_a, record_b, signals, record_a.type)
    feature_vector = np.array([feature_row])
    confidence = float(bundle.model.predict(feature_vector)[0])

    return {"confidence": confidence, "signals": signals}


def blocker_filter(
    pairs: list[tuple[RecordRef, RecordRef]],
    record_lookup: dict[RecordRef, object],  # StagedRecord or UnifiedRecord
    bundle: ModelBundle | None,
) -> list[tuple[RecordRef, RecordRef]]:
    """Filter candidate pairs using the blocker model. Pairs whose records belong to
    a different type than the blocker bundle are silently skipped (the matcher won't
    pass them in practice — defense in depth).
    """
    if bundle is None or not pairs:
        return pairs

    features = []
    valid_pairs = []

    for ref_a, ref_b in pairs:
        rec_a = record_lookup.get(ref_a)
        rec_b = record_lookup.get(ref_b)
        if rec_a is None or rec_b is None:
            continue
        if rec_a.type != bundle.record_type or rec_b.type != bundle.record_type:
            continue

        name_a = rec_a.normalized_name or rec_a.name or ""
        name_b = rec_b.normalized_name or rec_b.name or ""

        jw = JaroWinkler.similarity(name_a, name_b)
        tj = fuzz.token_set_ratio(name_a, name_b) / 100.0
        nlr, _ = _compute_engineered_features(name_a, name_b)

        features.append([jw, tj, nlr])
        valid_pairs.append((ref_a, ref_b))

    if not features:
        return []

    X = np.array(features)
    probs = bundle.model.predict(X)

    return [pair for pair, prob in zip(valid_pairs, probs, strict=False) if prob >= bundle.threshold]
