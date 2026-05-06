"""ML training service — extract features, train LightGBM models, save/load artifacts.

Trains two models from human review decisions:
- Scorer: type's signal vector + 2 engineered features, replaces weighted-sum confidence
- Blocker: 3 fast features (jaro_winkler on name, token_jaccard on name, name_length_ratio),
  pre-filters candidate pairs

Models are scoped per RecordType — a scorer trained for "supplier" cannot score
"material" pairs because their feature vectors differ.
"""

import logging
import os
from dataclasses import dataclass
from datetime import UTC, datetime

import lightgbm as lgb
import numpy as np
from sklearn.metrics import f1_score, precision_recall_curve, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sqlalchemy.orm import Session

from app.models.enums import CandidateStatus
from app.models.match import MatchCandidate
from app.models.ml_model import MLModelVersion
from app.models.staging import StagedRecord
from app.record_types import get as get_record_type
from app.services.scoring import signal_key

logger = logging.getLogger(__name__)

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "ml_models")

# Features added on top of the type's signal vector
ENGINEERED_FEATURE_NAMES = ["name_length_ratio", "token_count_diff"]

# Blocker uses a small fast-feature subset — does not depend on the type's signal list
BLOCKER_FEATURE_NAMES = [
    "jaro_winkler",
    "token_jaccard",
    "name_length_ratio",
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
    record_type: str


def _compute_engineered_features(name_a: str, name_b: str) -> tuple[float, float]:
    """Compute name_length_ratio and token_count_diff from record names."""
    len_a = max(len(name_a), 1)
    len_b = max(len(name_b), 1)
    name_length_ratio = min(len_a, len_b) / max(len_a, len_b)
    tokens_a = len(name_a.split())
    tokens_b = len(name_b.split())
    token_count_diff = abs(tokens_a - tokens_b)
    return name_length_ratio, float(token_count_diff)


def scorer_feature_names(record_type_key: str) -> list[str]:
    """Return the scorer feature names for a record type: <type signals> + engineered."""
    rt = get_record_type(record_type_key)
    signal_features = [signal_key(s.kind, s.field) for s in rt.signals]
    return signal_features + ENGINEERED_FEATURE_NAMES


def _safe_lgbm_feature_names(feature_names: list[str]) -> list[str]:
    """Sanitize feature names for LightGBM; colons and other special JSON chars are not allowed."""
    return [name.replace(":", "__") for name in feature_names]


def _build_scorer_row(
    record_a: StagedRecord,
    record_b: StagedRecord,
    signals: dict | None,
    record_type_key: str,
) -> list[float]:
    """Build one scorer feature row.

    Reads each type-declared signal from `signals` (the JSONB dict stored on the
    candidate at scoring time) — falls back to 0.0 for any missing signal.
    Adds engineered features at the end.
    """
    rt = get_record_type(record_type_key)
    sig_dict = signals or {}
    row = [float(sig_dict.get(signal_key(s.kind, s.field), 0.0)) for s in rt.signals]
    name_a = record_a.normalized_name or record_a.name or ""
    name_b = record_b.normalized_name or record_b.name or ""
    nlr, tcd = _compute_engineered_features(name_a, name_b)
    row.append(nlr)
    row.append(tcd)
    return row


def extract_training_data(db: Session, record_type_key: str) -> tuple[np.ndarray, np.ndarray]:
    """Extract feature matrix and labels for confirmed/rejected candidates of a record type."""
    candidates = (
        db.query(MatchCandidate)
        .filter(
            MatchCandidate.type == record_type_key,
            MatchCandidate.status.in_([CandidateStatus.CONFIRMED, CandidateStatus.REJECTED]),
        )
        .all()
    )

    feature_names = scorer_feature_names(record_type_key)
    if not candidates:
        return np.empty((0, len(feature_names))), np.empty(0)

    record_ids = set()
    for c in candidates:
        record_ids.add(c.record_a_id)
        record_ids.add(c.record_b_id)

    records = db.query(StagedRecord).filter(StagedRecord.id.in_(record_ids)).all()
    record_map = {r.id: r for r in records}

    rows = []
    labels = []
    for c in candidates:
        rec_a = record_map.get(c.record_a_id)
        rec_b = record_map.get(c.record_b_id)
        if rec_a is None or rec_b is None:
            continue
        rows.append(_build_scorer_row(rec_a, rec_b, c.match_signals, record_type_key))
        labels.append(1 if c.status == CandidateStatus.CONFIRMED else 0)

    X = np.array(rows, dtype=np.float64)
    y = np.array(labels, dtype=np.int32)
    return X, y


def extract_blocker_training_data(db: Session, record_type_key: str) -> tuple[np.ndarray, np.ndarray]:
    """Extract a 3-feature dataset for the blocker model."""
    candidates = (
        db.query(MatchCandidate)
        .filter(
            MatchCandidate.type == record_type_key,
            MatchCandidate.status.in_([CandidateStatus.CONFIRMED, CandidateStatus.REJECTED]),
        )
        .all()
    )

    if not candidates:
        return np.empty((0, len(BLOCKER_FEATURE_NAMES))), np.empty(0)

    record_ids = set()
    for c in candidates:
        record_ids.add(c.record_a_id)
        record_ids.add(c.record_b_id)
    records = db.query(StagedRecord).filter(StagedRecord.id.in_(record_ids)).all()
    record_map = {r.id: r for r in records}

    from rapidfuzz import fuzz
    from rapidfuzz.distance import JaroWinkler

    rows = []
    labels = []
    for c in candidates:
        rec_a = record_map.get(c.record_a_id)
        rec_b = record_map.get(c.record_b_id)
        if rec_a is None or rec_b is None:
            continue
        name_a = rec_a.normalized_name or rec_a.name or ""
        name_b = rec_b.normalized_name or rec_b.name or ""
        jw = JaroWinkler.similarity(name_a, name_b)
        tj = fuzz.token_set_ratio(name_a, name_b) / 100.0
        nlr, _ = _compute_engineered_features(name_a, name_b)
        rows.append([jw, tj, nlr])
        labels.append(1 if c.status == CandidateStatus.CONFIRMED else 0)

    X = np.array(rows, dtype=np.float64)
    y = np.array(labels, dtype=np.int32)
    return X, y


def train_model(
    X: np.ndarray,
    y: np.ndarray,
    feature_names: list[str],
    model_type: str = "scorer",
) -> dict:
    """Train a LightGBM binary classifier."""
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, stratify=y, random_state=42)

    # LightGBM rejects special JSON characters (e.g. colons) in feature names
    safe_names = _safe_lgbm_feature_names(feature_names)
    train_data = lgb.Dataset(X_train, label=y_train, feature_name=safe_names)
    valid_data = lgb.Dataset(X_test, label=y_test, feature_name=safe_names, reference=train_data)

    model = lgb.train(
        {k: v for k, v in LGB_PARAMS.items() if k != "n_estimators"},
        train_data,
        num_boost_round=LGB_PARAMS["n_estimators"],
        valid_sets=[valid_data],
    )

    y_prob = model.predict(X_test)

    if model_type == "blocker":
        precision_arr, recall_arr, thresholds = precision_recall_curve(y_test, y_prob)
        candidates_idx = np.where(recall_arr >= 0.98)[0]
        valid_idx = candidates_idx[candidates_idx < len(thresholds)]
        threshold = float(thresholds[valid_idx].min()) if len(valid_idx) > 0 else 0.1
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
    feature_importances = dict(zip(feature_names, [float(v) for v in importances], strict=False))

    logger.info("Trained %s model: %s", model_type, metrics)

    return {
        "model": model,
        "metrics": metrics,
        "feature_importances": feature_importances,
    }


def save_model(
    model: lgb.Booster,
    model_type: str,
    record_type_key: str,
    feature_names: list[str],
    metrics: dict,
    feature_importances: dict | None,
    sample_count: int,
    db: Session,
    created_by: str | None = None,
) -> MLModelVersion:
    """Save model to disk and record metadata in DB. Scoped per record type."""
    os.makedirs(MODEL_DIR, exist_ok=True)

    timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    filename = f"{model_type}_{record_type_key}_{timestamp}.lgbm"
    filepath = os.path.join(MODEL_DIR, filename)
    model.save_model(filepath)

    # Deactivate any previously active model for the same (model_type, record_type)
    db.query(MLModelVersion).filter(
        MLModelVersion.model_type == model_type,
        MLModelVersion.record_type == record_type_key,
        MLModelVersion.is_active.is_(True),
    ).update({"is_active": False}, synchronize_session="fetch")

    version = MLModelVersion(
        model_type=model_type,
        record_type=record_type_key,
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

    # Trim old versions of the same (model_type, record_type)
    old_versions = (
        db.query(MLModelVersion)
        .filter(
            MLModelVersion.model_type == model_type,
            MLModelVersion.record_type == record_type_key,
        )
        .order_by(MLModelVersion.created_at.desc())
        .offset(MAX_KEPT_VERSIONS)
        .all()
    )
    for old in old_versions:
        old_path = os.path.join(MODEL_DIR, old.filename)
        if os.path.exists(old_path):
            os.remove(old_path)
            logger.info("Removed old model file: %s", old_path)

    logger.info(
        "Saved %s model for %s: %s (version %d)",
        model_type,
        record_type_key,
        filename,
        version.id,
    )
    return version


def load_active_model(
    db: Session,
    model_type: str,
    record_type_key: str,
    model_dir: str | None = None,
) -> ModelBundle | None:
    """Load the active model for the given (model_type, record_type)."""
    version = (
        db.query(MLModelVersion)
        .filter(
            MLModelVersion.model_type == model_type,
            MLModelVersion.record_type == record_type_key,
            MLModelVersion.is_active.is_(True),
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
        record_type=version.record_type,
    )
