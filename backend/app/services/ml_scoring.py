"""ML scoring service — inference with trained LightGBM models.

Provides:
- ml_score_pair: Score a supplier pair using the ML scorer model
- blocker_filter: Pre-filter candidate pairs using the blocker model
"""

import numpy as np
from rapidfuzz import fuzz
from rapidfuzz.distance import JaroWinkler

from app.models.staging import StagedSupplier
from app.services.ml_training import ModelBundle, _compute_engineered_features
from app.services.scoring import score_pair as weighted_score_pair


def ml_score_pair(
    supplier_a: StagedSupplier,
    supplier_b: StagedSupplier,
    bundle: ModelBundle,
) -> dict:
    """Score a pair using the ML model."""
    base_result = weighted_score_pair(supplier_a, supplier_b)
    signals = base_result["signals"]

    name_a = supplier_a.normalized_name or supplier_a.name or ""
    name_b = supplier_b.normalized_name or supplier_b.name or ""
    nlr, tcd = _compute_engineered_features(name_a, name_b)

    feature_vector = np.array(
        [
            [
                signals.get("jaro_winkler", 0.0),
                signals.get("token_jaccard", 0.0),
                signals.get("embedding_cosine", 0.0),
                signals.get("short_name_match", 0.0),
                signals.get("currency_match", 0.0),
                signals.get("contact_match", 0.0),
                nlr,
                tcd,
            ]
        ]
    )

    confidence = float(bundle.model.predict(feature_vector)[0])

    return {
        "confidence": confidence,
        "signals": signals,
    }


def blocker_filter(
    pairs: list[tuple[int, int]],
    supplier_lookup: dict[int, StagedSupplier],
    bundle: ModelBundle | None,
) -> list[tuple[int, int]]:
    """Filter candidate pairs using the blocker model."""
    if bundle is None or not pairs:
        return pairs

    features = []
    valid_pairs = []

    for a_id, b_id in pairs:
        sup_a = supplier_lookup.get(a_id)
        sup_b = supplier_lookup.get(b_id)
        if sup_a is None or sup_b is None:
            continue

        name_a = sup_a.normalized_name or sup_a.name or ""
        name_b = sup_b.normalized_name or sup_b.name or ""

        jw = JaroWinkler.similarity(name_a, name_b)
        tj = fuzz.token_set_ratio(name_a, name_b) / 100.0
        nlr, _ = _compute_engineered_features(name_a, name_b)

        features.append([jw, tj, nlr])
        valid_pairs.append((a_id, b_id))

    if not features:
        return []

    X = np.array(features)
    probs = bundle.model.predict(X)

    return [pair for pair, prob in zip(valid_pairs, probs, strict=False) if prob >= bundle.threshold]
