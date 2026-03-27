# ML-Enhanced Matching: GBM Classifier with Active Learning

**Date:** 2026-03-26
**Status:** Approved
**Approach:** LightGBM binary classifier replacing weighted-sum scorer

## Problem

The current matching pipeline uses a linear weighted sum of 6 signals with a fixed confidence threshold (0.45). This produces 28,419 candidates from 4,932 supplier rows — too many for efficient human review. The weighted-sum approach cannot capture non-linear feature interactions (e.g., high jaro-winkler + low embedding similarity might mean abbreviation, not a match). The existing retraining (`retrain_weights`) only adjusts linear weights from mean-difference analysis, which is limited.

## Solution

Replace the weighted-sum scorer with a LightGBM binary classifier trained on human review decisions. Add a learned pre-filter (blocker) to prune low-quality pairs before full scoring. Use active learning (uncertainty sampling) to prioritize the most informative pairs for review, accelerating model improvement.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Model type | LightGBM binary classifier | Fast inference (~microseconds/pair), works well on small tabular datasets, interpretable feature importances, handles the 8-feature vector without overfitting |
| Feature set | 6 existing signals + 2 engineered | Reuses all existing signal computation. Engineered features (name_length_ratio, token_count_diff) capture structural patterns the base signals miss |
| Blocker model | Separate LightGBM on 3 fast features | jaro_winkler + token_jaccard + name_length_ratio require no DB lookups or embeddings. Optimized for 98% recall to minimize false negatives |
| Training trigger | Manual API endpoint | Admin decides when enough labels have accumulated. Predictable, no surprise model changes mid-review session |
| Active learning | Uncertainty sampling (sort by distance to 0.5) | Most informative examples improve the model fastest. Implemented as a sort option on the existing queue — no new UI |
| Auto-decisions | None — ranking only | Reviewers see every pair. ML model ranks the queue for efficiency. Keeps human in the loop for all decisions |
| Fallback | Weighted-sum scorer | If no trained model exists, the pipeline behaves exactly as before. ML is an enhancement, not a requirement |
| Model storage | File on disk + metadata in DB | Model artifact in `backend/ml_models/` (gitignored). Training metadata (metrics, feature importances, sample count) in `ml_model_versions` table |

## Training Data Collection

Every reviewer decision (confirm/reject) on a match candidate is a training example. No new collection mechanism needed — the data already exists.

**Training example format:**

| Feature | Source |
|---------|--------|
| jaro_winkler | `match_candidates.match_signals -> 'jaro_winkler'` |
| token_jaccard | `match_candidates.match_signals -> 'token_jaccard'` |
| embedding_cosine | `match_candidates.match_signals -> 'embedding_cosine'` |
| short_name_match | `match_candidates.match_signals -> 'short_name_match'` |
| currency_match | `match_candidates.match_signals -> 'currency_match'` |
| contact_match | `match_candidates.match_signals -> 'contact_match'` |
| name_length_ratio | `min(len(name_a), len(name_b)) / max(len(name_a), len(name_b))` — computed at training time from staged suppliers |
| token_count_diff | `abs(token_count(name_a) - token_count(name_b))` — computed at training time |
| label | `1` if confirmed, `0` if rejected — from `match_candidates.status` |

The 6 base signals are already persisted in `match_signals` JSON. The 2 engineered features are derived from the staged suppliers at training time (cheap to compute, not stored). The `MatchSignals` Pydantic schema is intentionally kept at 6 fields — engineered features are not persisted.

**Training data filtering:** Only candidates with status `confirmed` or `rejected` are used. Candidates with status `skipped`, `pending`, or `invalidated` are excluded.

**Minimum training set:** 50 labeled pairs (configurable). Must include both confirmed and rejected examples.

**Class imbalance:** Early review cycles will skew heavily positive (reviewers see high-confidence pairs first). LightGBM is configured with `is_unbalance=True` to handle this automatically via internal class weighting.

**Seed labeling:** No new UI. The reviewer uses the existing review queue with the default confidence-descending sort to label the first ~50-200 pairs. This gives the model a mix of high-confidence (likely true matches) and borderline cases.

## Model Architecture & Training

**Model:** LightGBM binary classifier (`objective='binary'`, `metric='binary_logloss'`).

**Hyperparameters:**

```python
params = {
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
```

Tuned for small datasets (5 min_child_samples prevents overfitting on <1000 examples). `is_unbalance=True` handles skewed label ratios from early review cycles.

**Training pipeline (`app/services/ml_training.py`):**

1. `extract_training_data(db)` — Query confirmed + rejected candidates, join to staged suppliers for engineered features, return feature matrix X and label vector y
2. `train_model(X, y, model_type)` — Stratified 80/20 split, train LightGBM, evaluate on holdout
3. `evaluate_model(model, X_test, y_test)` — Compute precision, recall, F1, AUC, optimal threshold (from precision-recall curve)
4. `save_model(model, metadata, db)` — Save model file to `backend/ml_models/{model_type}_{timestamp}.lgbm`, insert row into `ml_model_versions`, set `is_active=True` (deactivate previous)

**Two models trained in one call:**

- **Scorer model** — all 8 features, optimized for overall accuracy (F1)
- **Blocker model** — 3 fast features only (jaro_winkler, token_jaccard, name_length_ratio), threshold set at 98% recall operating point

**Model loading:** `load_active_model(db, model_type)` queries `ml_model_versions` for the active model of the given type, loads the `.lgbm` file from disk. Returns a `ModelBundle` dataclass containing the model, threshold, and feature names — or `None` if no active model exists:

```python
@dataclass
class ModelBundle:
    model: lgb.Booster
    threshold: float
    feature_names: list[str]
```

**Concurrency:** The training endpoint acquires a PostgreSQL advisory lock (`pg_advisory_xact_lock`) to prevent concurrent training. The `is_active` flag swap (deactivate old + activate new) happens in a single transaction. A pipeline already in progress uses the model loaded at its start — the swap does not affect in-flight pipelines.

**Model directory:** Training code calls `os.makedirs("ml_models", exist_ok=True)` before saving. Old model files are retained for rollback; the last 5 versions are kept, older files are deleted during training.

## ML Scorer — Pipeline Integration

The ML model replaces the weighted-sum confidence computation in `matching.py`.

**New function in `app/services/ml_scoring.py`:**

```python
def ml_score_pair(supplier_a, supplier_b, bundle: ModelBundle) -> dict:
    """Score a pair using the ML model.

    Computes 6 base signals (reuses existing signal code) + 2 engineered features.
    Returns dict with 'confidence' (model probability) and 'signals' (all 6 base signals).
    """
```

**Integration in `matching.py`:**

```python
from app.services.ml_scoring import ml_score_pair, load_active_model

# At start of run_matching_pipeline:
scorer_bundle = load_active_model(db, "scorer")
blocker_bundle = load_active_model(db, "blocker")

# At scoring step:
if scorer_bundle is not None:
    result = ml_score_pair(supplier_a, supplier_b, scorer_bundle)
else:
    result = score_pair(supplier_a, supplier_b, weights=signal_weights)
```

**Signals still stored:** All 6 base signals are saved to `match_candidates.match_signals` regardless of which scorer is used. The ML confidence replaces the weighted sum but the signal breakdown remains visible to reviewers.

## Learned Blocker — Pre-Filter

A fast pre-filter between blocking and full scoring.

**Pipeline position:**

```
Blocking → Combine Pairs → Learned Blocker (prune) → Full Scoring → Clustering → Insertion
```

**How it works:**

After `combine_blocks` produces candidate pairs, the blocker computes 3 fast features for each pair (jaro_winkler, token_jaccard, name_length_ratio — requires only `normalized_name`, no DB lookups). Pairs where `blocker_bundle.model.predict_proba(features)[1] < blocker_bundle.threshold` are dropped.

The threshold is determined at training time: find the operating point on the precision-recall curve where recall >= 0.98. This ensures at most 2% of true matches are lost. The threshold is stored in the `metrics` JSON of `ml_model_versions` and loaded via the `ModelBundle`.

**Fallback:** No blocker model → skip pruning. All pairs proceed to scoring as before.

**New function in `app/services/ml_scoring.py`:**

```python
def blocker_filter(pairs, supplier_lookup, bundle: ModelBundle) -> list:
    """Filter candidate pairs using the blocker model.

    Args:
        pairs: List of (supplier_a_id, supplier_b_id) tuples.
        supplier_lookup: Dict mapping supplier ID to StagedSupplier.
        bundle: ModelBundle containing model, threshold, and feature names.

    Returns:
        Filtered list of pairs that pass the blocker threshold.
    """
```

## Active Learning — Queue Ordering

The existing review queue gains a new sort option.

**Change to `GET /api/review/queue`:**

New query parameter: `sort` as a `Literal["confidence_desc", "confidence_asc", "active_learning"]` with default `confidence_desc`. FastAPI validates the enum automatically — invalid values return 422.

- `confidence_desc` (default, current behavior) — highest confidence first
- `confidence_asc` — lowest confidence first
- `active_learning` — most uncertain first (`abs(confidence - 0.5)` ascending)

The `active_learning` sort uses the confidence already stored on the match candidate (whether from weighted-sum or ML scorer). No re-inference needed — it's purely a sort order change.

**Retraining cycle:**

1. Reviewer labels 50+ pairs using existing queue (seed batch)
2. Admin calls `POST /api/matching/train-model`
3. Endpoint trains both models, returns metrics (precision, recall, F1, AUC, feature importances, sample count)
4. Next pipeline run uses ML scorer + blocker
5. Reviewer switches to `sort=active_learning` for ongoing labeling
6. After 50+ new labels accumulate, admin retrains
7. Each cycle improves the model

## Schema Change

**New table: `ml_model_versions`**

```python
class MLModelVersion(Base):
    __tablename__ = "ml_model_versions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    model_type = Column(String(50), nullable=False)  # "scorer" or "blocker"
    filename = Column(String(255), nullable=False)     # path to .lgbm file
    feature_names = Column(JSON, nullable=False)       # ordered feature list
    metrics = Column(JSON, nullable=False)             # {precision, recall, f1, auc, threshold}
    feature_importances = Column(JSON, nullable=True)  # {feature: importance}
    sample_count = Column(Integer, nullable=False)     # training examples used
    is_active = Column(Boolean, default=False)         # currently used by pipeline
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
```

One Alembic migration (`alembic/versions/007_add_ml_model_versions.py`). The `down_revision` chains from the current head (006).

## API Endpoints

**New: `POST /api/matching/train-model`** (admin-only)

Triggers model training from accumulated review decisions. Requires admin role — uses `get_current_user` with an admin check since training replaces the scoring engine for the entire system.

Request: empty body (trains from all confirmed/rejected candidates)

Response:
```json
{
  "scorer": {
    "model_id": 1,
    "sample_count": 150,
    "metrics": {"precision": 0.92, "recall": 0.88, "f1": 0.90, "auc": 0.95},
    "feature_importances": {"jaro_winkler": 0.25, "embedding_cosine": 0.22, ...},
    "threshold": 0.45
  },
  "blocker": {
    "model_id": 2,
    "sample_count": 150,
    "metrics": {"precision": 0.65, "recall": 0.98, "f1": 0.78, "auc": 0.88},
    "threshold": 0.12
  }
}
```

Returns 400 if fewer than 50 labeled pairs exist.

**Modified: `GET /api/review/queue`**

New optional parameter: `sort` (`Literal`, default `confidence_desc`). Values: `confidence_desc`, `confidence_asc`, `active_learning`.

**Existing: `POST /api/matching/retrain`** — kept as-is. It adjusts linear weights for the weighted-sum fallback scorer. When an ML model is active, the retrained weights are unused (the ML model takes precedence). Both endpoints coexist: `retrain` for the linear fallback, `train-model` for the ML scorer.

## Files Changed

| File | Change |
|------|--------|
| `app/models/ml_model.py` | **New** — MLModelVersion ORM model |
| `app/models/__init__.py` | Register MLModelVersion import |
| `app/services/ml_training.py` | **New** — Feature extraction, training, evaluation, model save/load |
| `app/services/ml_scoring.py` | **New** — ML scorer + blocker inference |
| `alembic/versions/007_add_ml_model_versions.py` | **New** — Migration |
| `app/services/matching.py` | Load ML models, use ml_score_pair when available, insert blocker step |
| `app/routers/matching.py` | Add `POST /api/matching/train-model` endpoint |
| `app/routers/review.py` | Add `sort` parameter to queue endpoint |
| `requirements.txt` | Add `lightgbm` |
| `.gitignore` | Add `backend/ml_models/` |
| `tests/test_ml_training.py` | **New** — Training pipeline tests |
| `tests/test_ml_scoring.py` | **New** — Inference + fallback tests |

**No changes to:** review UI, merge flow, ingestion, grouping, blocking, clustering, existing tests.

## Testing Strategy

### New: `tests/test_ml_training.py`

- Feature extraction from confirmed/rejected candidates produces correct matrix shape
- Training with sufficient data returns model + metrics
- Training with insufficient data (<50 examples) returns appropriate error
- Stratified split maintains label ratio
- Blocker threshold targets 98% recall
- Model save/load round-trip preserves predictions
- `is_active` flag management: new model deactivates old one

### New: `tests/test_ml_scoring.py`

- `ml_score_pair` returns confidence in [0, 1] and all 6 signals
- Fallback to weighted-sum when no model exists
- Blocker filter removes low-confidence pairs
- Blocker filter with no model passes all pairs through
- Engineered features computed correctly (name_length_ratio, token_count_diff)

### Extended: `tests/test_matching_service.py`

- Pipeline uses ML scorer when model exists
- Pipeline uses weighted-sum when no model exists
- Blocker prunes pairs before scoring step

### Extended: `tests/test_matching_api.py`

- `POST /api/matching/train-model` returns metrics
- `POST /api/matching/train-model` returns 400 with insufficient data
- `GET /api/review/queue?sort=active_learning` returns uncertainty-ordered results
