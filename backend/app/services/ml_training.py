"""ML training service — extract features, train LightGBM models, save/load artifacts.

Trains two models from human review decisions:
- Scorer: 8 features, replaces weighted-sum confidence
- Blocker: 3 fast features, pre-filters candidate pairs
"""

import logging
import os
from dataclasses import dataclass
from datetime import datetime

import lightgbm as lgb
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.metrics import precision_recall_curve, precision_score, recall_score, f1_score, roc_auc_score
from sqlalchemy.orm import Session

from app.models.match import MatchCandidate
from app.models.ml_model import MLModelVersion
from app.models.staging import StagedSupplier

logger = logging.getLogger(__name__)

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "ml_models")

SCORER_FEATURE_NAMES = [
    "jaro_winkler", "token_jaccard", "embedding_cosine",
    "short_name_match", "currency_match", "contact_match",
    "name_length_ratio", "token_count_diff",
]

BLOCKER_FEATURE_NAMES = [
    "jaro_winkler", "token_jaccard", "name_length_ratio",
]

LGB_PARAMS = {
    "objective": "binary",
    "metric": "binary_logloss",
    "n_estimators": 200,
    "max_depth": 6,
    "learning_rate": 0.1,
    "min_child_samples": 5,
    "num_leaves": 31,
    "is_unbalance": True,
    "verbosity": -1,
}

MIN_TRAINING_SAMPLES = 50
MAX_KEPT_VERSIONS = 5


@dataclass
class ModelBundle:
    """Bundles a loaded model with its threshold and feature names."""
    model: lgb.Booster
    threshold: float
    feature_names: list[str]


def _compute_engineered_features(name_a: str, name_b: str) -> tuple[float, float]:
    """Compute name_length_ratio and token_count_diff from supplier names."""
    len_a = max(len(name_a), 1)
    len_b = max(len(name_b), 1)
    name_length_ratio = min(len_a, len_b) / max(len_a, len_b)

    tokens_a = len(name_a.split())
    tokens_b = len(name_b.split())
    token_count_diff = abs(tokens_a - tokens_b)

    return name_length_ratio, float(token_count_diff)


def extract_training_data(db: Session) -> tuple[np.ndarray, np.ndarray]:
    """Extract feature matrix and labels from confirmed/rejected candidates."""
    candidates = (
        db.query(MatchCandidate)
        .filter(MatchCandidate.status.in_(["confirmed", "rejected"]))
        .all()
    )

    if not candidates:
        return np.empty((0, 8)), np.empty(0)

    supplier_ids = set()
    for c in candidates:
        supplier_ids.add(c.supplier_a_id)
        supplier_ids.add(c.supplier_b_id)

    suppliers = (
        db.query(StagedSupplier)
        .filter(StagedSupplier.id.in_(supplier_ids))
        .all()
    )
    supplier_map = {s.id: s for s in suppliers}

    rows = []
    labels = []

    for c in candidates:
        sup_a = supplier_map.get(c.supplier_a_id)
        sup_b = supplier_map.get(c.supplier_b_id)
        if sup_a is None or sup_b is None:
            continue

        signals = c.match_signals or {}

        base = [
            signals.get("jaro_winkler", 0.0),
            signals.get("token_jaccard", 0.0),
            signals.get("embedding_cosine", 0.0),
            signals.get("short_name_match", 0.0),
            signals.get("currency_match", 0.0),
            signals.get("contact_match", 0.0),
        ]

        name_a = sup_a.normalized_name or sup_a.name or ""
        name_b = sup_b.normalized_name or sup_b.name or ""
        nlr, tcd = _compute_engineered_features(name_a, name_b)

        rows.append(base + [nlr, tcd])
        labels.append(1 if c.status == "confirmed" else 0)

    X = np.array(rows, dtype=np.float64)
    y = np.array(labels, dtype=np.int32)

    return X, y


def train_model(
    X: np.ndarray,
    y: np.ndarray,
    model_type: str = "scorer",
) -> dict:
    """Train a LightGBM binary classifier."""
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42,
    )

    feature_names = BLOCKER_FEATURE_NAMES if model_type == "blocker" else SCORER_FEATURE_NAMES
    feature_names = feature_names[:X.shape[1]]

    train_data = lgb.Dataset(X_train, label=y_train, feature_name=feature_names)
    valid_data = lgb.Dataset(X_test, label=y_test, feature_name=feature_names, reference=train_data)

    model = lgb.train(
        {k: v for k, v in LGB_PARAMS.items() if k != "n_estimators"},
        train_data,
        num_boost_round=LGB_PARAMS["n_estimators"],
        valid_sets=[valid_data],
    )

    y_prob = model.predict(X_test)

    if model_type == "blocker":
        precision_arr, recall_arr, thresholds = precision_recall_curve(y_test, y_prob)
        # For a blocker we want the LOWEST threshold that still achieves recall >= 0.98
        # (cast the widest net while maintaining coverage).
        candidates_idx = np.where(recall_arr >= 0.98)[0]
        # precision_recall_curve produces len(thresholds) == len(recall_arr) - 1;
        # the last element of recall_arr/precision_arr has no corresponding threshold.
        valid_idx = candidates_idx[candidates_idx < len(thresholds)]
        if len(valid_idx) > 0:
            threshold = float(thresholds[valid_idx].min())
        else:
            threshold = 0.1
    else:
        precision_arr, recall_arr, thresholds = precision_recall_curve(y_test, y_prob)
        f1_scores = 2 * precision_arr * recall_arr / (precision_arr + recall_arr + 1e-10)
        best_idx = np.argmax(f1_scores)
        threshold = float(thresholds[best_idx]) if best_idx < len(thresholds) else 0.5

    y_pred = (y_prob >= threshold).astype(int)
    metrics = {
        "precision": float(precision_score(y_test, y_pred, zero_division=0)),
        "recall": float(recall_score(y_test, y_pred, zero_division=0)),
        "f1": float(f1_score(y_test, y_pred, zero_division=0)),
        "auc": float(roc_auc_score(y_test, y_prob)),
        "threshold": threshold,
    }

    importances = model.feature_importance(importance_type="gain")
    feature_importances = dict(zip(feature_names, [float(v) for v in importances]))

    logger.info("Trained %s model: %s", model_type, metrics)

    return {
        "model": model,
        "metrics": metrics,
        "feature_importances": feature_importances,
    }


def save_model(
    model: lgb.Booster,
    model_type: str,
    feature_names: list[str],
    metrics: dict,
    feature_importances: dict | None,
    sample_count: int,
    db: Session,
    created_by: str | None = None,
) -> MLModelVersion:
    """Save model to disk and record metadata in DB."""
    os.makedirs(MODEL_DIR, exist_ok=True)

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"{model_type}_{timestamp}.lgbm"
    filepath = os.path.join(MODEL_DIR, filename)

    model.save_model(filepath)

    db.query(MLModelVersion).filter(
        MLModelVersion.model_type == model_type,
        MLModelVersion.is_active == True,
    ).update({"is_active": False}, synchronize_session="fetch")

    version = MLModelVersion(
        model_type=model_type,
        filename=filename,
        feature_names=feature_names,
        metrics=metrics,
        feature_importances=feature_importances,
        sample_count=sample_count,
        is_active=True,
        created_by=created_by,
    )
    db.add(version)
    db.flush()

    old_versions = (
        db.query(MLModelVersion)
        .filter(MLModelVersion.model_type == model_type)
        .order_by(MLModelVersion.created_at.desc())
        .offset(MAX_KEPT_VERSIONS)
        .all()
    )
    for old in old_versions:
        old_path = os.path.join(MODEL_DIR, old.filename)
        if os.path.exists(old_path):
            os.remove(old_path)
            logger.info("Removed old model file: %s", old_path)

    logger.info("Saved %s model: %s (version %d)", model_type, filename, version.id)
    return version


def load_active_model(
    db: Session,
    model_type: str,
    model_dir: str | None = None,
) -> ModelBundle | None:
    """Load the active model for the given type."""
    version = (
        db.query(MLModelVersion)
        .filter(
            MLModelVersion.model_type == model_type,
            MLModelVersion.is_active == True,
        )
        .first()
    )

    if version is None:
        return None

    base_dir = model_dir or MODEL_DIR
    filepath = os.path.join(base_dir, version.filename)

    if not os.path.exists(filepath):
        logger.warning("Model file not found: %s", filepath)
        return None

    model = lgb.Booster(model_file=filepath)
    threshold = version.metrics.get("threshold", 0.5)

    return ModelBundle(
        model=model,
        threshold=threshold,
        feature_names=version.feature_names,
    )
