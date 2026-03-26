# ML-Enhanced Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the weighted-sum scorer with a LightGBM binary classifier trained on human review decisions, add a learned pre-filter (blocker), and enable active learning queue ordering.

**Architecture:** Two LightGBM models — a scorer (8 features, replaces weighted-sum) and a blocker (3 fast features, pre-filters pairs before scoring). Both are trained from confirmed/rejected match candidates via a manual API endpoint. When no ML model exists, the pipeline falls back to the existing weighted-sum scorer unchanged.

**Tech Stack:** LightGBM, scikit-learn (train_test_split, metrics), existing FastAPI/SQLAlchemy/Alembic stack.

**Spec:** `docs/specs/2026-03-26-ml-enhanced-matching-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `app/models/ml_model.py` | **New** — `MLModelVersion` ORM model |
| `app/models/__init__.py` | Register `MLModelVersion` import |
| `app/services/ml_training.py` | **New** — Feature extraction, model training, evaluation, save/load |
| `app/services/ml_scoring.py` | **New** — `ml_score_pair`, `blocker_filter` (imports `ModelBundle` and `load_active_model` from `ml_training`) |
| `app/schemas/matching.py` | Add `TrainModelResponse` schema |
| `app/routers/matching.py` | Add `POST /api/matching/train-model` endpoint |
| `app/routers/review.py` | Add `sort` query parameter to `GET /api/review/queue` |
| `app/services/matching.py` | Load ML models, wire `ml_score_pair` + `blocker_filter` into pipeline |
| `alembic/versions/007_add_ml_model_versions.py` | **New** — Migration for `ml_model_versions` table |
| `requirements.txt` | Add `lightgbm`, `scikit-learn` |
| `.gitignore` | Add `backend/ml_models/` |
| `tests/test_ml_training.py` | **New** — Training pipeline tests |
| `tests/test_ml_scoring.py` | **New** — Scoring + blocker inference tests |

---

### Task 1: Add dependencies and gitignore entry

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `.gitignore` (root)

- [ ] **Step 1: Add lightgbm and scikit-learn to requirements.txt**

In `backend/requirements.txt`, add after the existing entries:

```
lightgbm
scikit-learn
```

- [ ] **Step 2: Add ml_models/ to .gitignore**

In `.gitignore`, add under the `# ── Uploads & local data ──` section:

```
# ── ML model artifacts ──
backend/ml_models/
```

- [ ] **Step 3: Install new dependencies**

Run: `cd backend && source .venv/bin/activate && pip install lightgbm scikit-learn`
Expected: Successful installation.

- [ ] **Step 4: Verify imports work**

Run: `cd backend && python -c "import lightgbm; import sklearn; print('OK')"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/requirements.txt .gitignore
git commit -m "chore: add lightgbm and scikit-learn dependencies"
```

---

### Task 2: MLModelVersion ORM model and migration

**Files:**
- Create: `backend/app/models/ml_model.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/alembic/versions/007_add_ml_model_versions.py`
- Create: `backend/tests/test_ml_model.py`

- [ ] **Step 1: Write test for MLModelVersion model creation**

Create `backend/tests/test_ml_model.py`:

```python
"""Tests for MLModelVersion ORM model."""

from app.models.ml_model import MLModelVersion


class TestMLModelVersion:
    def test_create_model_version(self, test_db):
        mv = MLModelVersion(
            model_type="scorer",
            filename="ml_models/scorer_20260326.lgbm",
            feature_names=["jaro_winkler", "token_jaccard", "embedding_cosine",
                           "short_name_match", "currency_match", "contact_match",
                           "name_length_ratio", "token_count_diff"],
            metrics={"precision": 0.92, "recall": 0.88, "f1": 0.90, "auc": 0.95, "threshold": 0.45},
            sample_count=150,
            is_active=True,
            created_by="admin",
        )
        test_db.add(mv)
        test_db.flush()

        assert mv.id is not None
        assert mv.model_type == "scorer"
        assert mv.is_active is True
        assert mv.feature_names[0] == "jaro_winkler"
        assert mv.metrics["f1"] == 0.90
        assert mv.created_at is not None

    def test_active_flag_default_false(self, test_db):
        mv = MLModelVersion(
            model_type="blocker",
            filename="ml_models/blocker_20260326.lgbm",
            feature_names=["jaro_winkler", "token_jaccard", "name_length_ratio"],
            metrics={"recall": 0.98, "threshold": 0.12},
            sample_count=150,
        )
        test_db.add(mv)
        test_db.flush()

        assert mv.is_active is False

    def test_query_active_model(self, test_db):
        old = MLModelVersion(
            model_type="scorer",
            filename="ml_models/scorer_old.lgbm",
            feature_names=["jaro_winkler"],
            metrics={"f1": 0.80},
            sample_count=100,
            is_active=False,
        )
        new = MLModelVersion(
            model_type="scorer",
            filename="ml_models/scorer_new.lgbm",
            feature_names=["jaro_winkler"],
            metrics={"f1": 0.90},
            sample_count=200,
            is_active=True,
        )
        test_db.add_all([old, new])
        test_db.flush()

        active = (
            test_db.query(MLModelVersion)
            .filter(MLModelVersion.model_type == "scorer", MLModelVersion.is_active == True)
            .first()
        )
        assert active is not None
        assert active.filename == "ml_models/scorer_new.lgbm"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_ml_model.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.models.ml_model'`

- [ ] **Step 3: Create MLModelVersion model**

Create `backend/app/models/ml_model.py`:

```python
"""MLModelVersion ORM model — tracks trained ML model artifacts and metadata."""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, JSON, func

from app.models.base import Base


class MLModelVersion(Base):
    __tablename__ = "ml_model_versions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    model_type = Column(String(50), nullable=False)      # "scorer" or "blocker"
    filename = Column(String(255), nullable=False)        # path to .lgbm file
    feature_names = Column(JSON, nullable=False)          # ordered feature list
    metrics = Column(JSON, nullable=False)                # {precision, recall, f1, auc, threshold}
    feature_importances = Column(JSON, nullable=True)     # {feature: importance}
    sample_count = Column(Integer, nullable=False)        # training examples used
    is_active = Column(Boolean, default=False)            # currently used by pipeline
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
```

- [ ] **Step 4: Register in models/__init__.py**

In `backend/app/models/__init__.py`, add after the `UnifiedSupplier` import:

```python
from app.models.ml_model import MLModelVersion
```

And add `"MLModelVersion"` to `__all__`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_ml_model.py -v`
Expected: 3 passed

- [ ] **Step 6: Create Alembic migration**

Create `backend/alembic/versions/007_add_ml_model_versions.py`:

```python
"""Add ml_model_versions table

Revision ID: 007
Revises: 006
Create Date: 2026-03-26

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ml_model_versions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("model_type", sa.String(50), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("feature_names", sa.JSON(), nullable=False),
        sa.Column("metrics", sa.JSON(), nullable=False),
        sa.Column("feature_importances", sa.JSON(), nullable=True),
        sa.Column("sample_count", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), default=False),
        sa.Column("created_by", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_ml_model_type_active", "ml_model_versions", ["model_type", "is_active"])


def downgrade() -> None:
    op.drop_index("ix_ml_model_type_active", table_name="ml_model_versions")
    op.drop_table("ml_model_versions")
```

- [ ] **Step 7: Run full test suite to verify nothing breaks**

Run: `cd backend && python -m pytest tests/test_ml_model.py tests/test_matching_service.py -v`
Expected: All pass.

- [ ] **Step 8: Commit**

```bash
git add backend/app/models/ml_model.py backend/app/models/__init__.py \
        backend/alembic/versions/007_add_ml_model_versions.py \
        backend/tests/test_ml_model.py
git commit -m "feat: add MLModelVersion model and migration"
```

---

### Task 3: ML Training service

**Files:**
- Create: `backend/app/services/ml_training.py`
- Create: `backend/tests/test_ml_training.py`

**Context:** This service extracts training data from confirmed/rejected match candidates, trains both scorer and blocker LightGBM models, evaluates them, and saves model artifacts to disk + metadata to the DB. The 6 base signals are already stored in `match_candidates.match_signals` JSON. The 2 engineered features (`name_length_ratio`, `token_count_diff`) are derived from staged supplier names at training time.

- [ ] **Step 1: Write tests for feature extraction**

Create `backend/tests/test_ml_training.py`:

```python
"""Tests for ML training pipeline."""

import os
import tempfile
from unittest.mock import patch

import numpy as np
import pytest

from app.models.source import DataSource
from app.models.batch import ImportBatch
from app.models.staging import StagedSupplier
from app.models.match import MatchCandidate, MatchGroup
from app.models.ml_model import MLModelVersion


def _seed_reviewed_candidates(db, count=60, confirm_ratio=0.5):
    """Create reviewed match candidates with realistic signals.

    Returns list of (candidate, supplier_a, supplier_b) tuples.
    """
    s1 = DataSource(name="SRC1", file_format="csv", column_mapping={"supplier_name": "name"})
    s2 = DataSource(name="SRC2", file_format="csv", column_mapping={"supplier_name": "name"})
    db.add_all([s1, s2])
    db.flush()

    b1 = ImportBatch(data_source_id=s1.id, filename="a.csv", uploaded_by="u", status="completed", row_count=count)
    b2 = ImportBatch(data_source_id=s2.id, filename="b.csv", uploaded_by="u", status="completed", row_count=count)
    db.add_all([b1, b2])
    db.flush()

    results = []
    num_confirmed = int(count * confirm_ratio)

    for i in range(count):
        # Vary names to create realistic signal distributions
        if i < num_confirmed:
            name_a = f"ACME CORP {i}"
            name_b = f"ACME CORPORATION {i}"
            signals = {
                "jaro_winkler": 0.85 + np.random.uniform(-0.1, 0.1),
                "token_jaccard": 0.80 + np.random.uniform(-0.1, 0.1),
                "embedding_cosine": 0.90 + np.random.uniform(-0.05, 0.05),
                "short_name_match": 1.0,
                "currency_match": 1.0,
                "contact_match": 0.7 + np.random.uniform(-0.1, 0.1),
            }
            status = "confirmed"
        else:
            name_a = f"ALPHA INC {i}"
            name_b = f"BETA LLC {i}"
            signals = {
                "jaro_winkler": 0.40 + np.random.uniform(-0.1, 0.1),
                "token_jaccard": 0.30 + np.random.uniform(-0.1, 0.1),
                "embedding_cosine": 0.50 + np.random.uniform(-0.1, 0.1),
                "short_name_match": 0.0,
                "currency_match": 0.5,
                "contact_match": 0.3 + np.random.uniform(-0.1, 0.1),
            }
            status = "rejected"

        sup_a = StagedSupplier(
            import_batch_id=b1.id, data_source_id=s1.id,
            name=name_a, normalized_name=name_a.lower(),
            source_code=f"A{i:03d}", short_name="TST", currency="EUR",
            raw_data={"name": name_a}, status="active",
        )
        sup_b = StagedSupplier(
            import_batch_id=b2.id, data_source_id=s2.id,
            name=name_b, normalized_name=name_b.lower(),
            source_code=f"B{i:03d}", short_name="TST", currency="EUR",
            raw_data={"name": name_b}, status="active",
        )
        db.add_all([sup_a, sup_b])
        db.flush()

        mc = MatchCandidate(
            supplier_a_id=sup_a.id, supplier_b_id=sup_b.id,
            confidence=sum(signals.values()) / 6,
            match_signals=signals,
            status=status,
            reviewed_by="reviewer",
        )
        db.add(mc)
        results.append((mc, sup_a, sup_b))

    db.flush()
    return results


class TestExtractTrainingData:
    def test_extracts_confirmed_and_rejected(self, test_db):
        from app.services.ml_training import extract_training_data

        _seed_reviewed_candidates(test_db, count=60, confirm_ratio=0.5)
        test_db.flush()

        X, y = extract_training_data(test_db)

        assert X.shape[0] == 60
        assert X.shape[1] == 8  # 6 base + 2 engineered
        assert len(y) == 60
        assert sum(y) == 30  # 50% confirmed
        assert set(y) == {0, 1}

    def test_excludes_pending_and_skipped(self, test_db):
        from app.services.ml_training import extract_training_data

        _seed_reviewed_candidates(test_db, count=60)
        # Add a pending candidate
        s = DataSource(name="X", file_format="csv", column_mapping={"supplier_name": "n"})
        test_db.add(s)
        test_db.flush()
        b = ImportBatch(data_source_id=s.id, filename="x.csv", uploaded_by="u", status="completed", row_count=1)
        test_db.add(b)
        test_db.flush()
        sa_ = StagedSupplier(
            import_batch_id=b.id, data_source_id=s.id,
            name="PENDING", normalized_name="pending",
            source_code="P001", raw_data={}, status="active",
        )
        sb_ = StagedSupplier(
            import_batch_id=b.id, data_source_id=s.id,
            name="PENDING B", normalized_name="pending b",
            source_code="P002", raw_data={}, status="active",
        )
        test_db.add_all([sa_, sb_])
        test_db.flush()
        mc = MatchCandidate(
            supplier_a_id=sa_.id, supplier_b_id=sb_.id,
            confidence=0.5, match_signals={"jaro_winkler": 0.5, "token_jaccard": 0.5,
                                            "embedding_cosine": 0.5, "short_name_match": 0.5,
                                            "currency_match": 0.5, "contact_match": 0.5},
            status="pending",
        )
        test_db.add(mc)
        test_db.flush()

        X, y = extract_training_data(test_db)
        assert X.shape[0] == 60  # pending excluded

    def test_engineered_features_correct(self, test_db):
        from app.services.ml_training import extract_training_data

        _seed_reviewed_candidates(test_db, count=60)
        test_db.flush()

        X, y = extract_training_data(test_db)

        # name_length_ratio should be in (0, 1]
        name_length_ratios = X[:, 6]
        assert all(0 < r <= 1.0 for r in name_length_ratios)

        # token_count_diff should be >= 0
        token_count_diffs = X[:, 7]
        assert all(d >= 0 for d in token_count_diffs)

    def test_insufficient_data_returns_empty(self, test_db):
        from app.services.ml_training import extract_training_data

        # Only 10 candidates — below minimum
        _seed_reviewed_candidates(test_db, count=10)
        test_db.flush()

        X, y = extract_training_data(test_db)
        assert X.shape[0] == 10  # Still returns data, caller decides minimum


class TestTrainModel:
    def test_train_scorer_returns_metrics(self, test_db):
        from app.services.ml_training import extract_training_data, train_model

        _seed_reviewed_candidates(test_db, count=80, confirm_ratio=0.5)
        test_db.flush()

        X, y = extract_training_data(test_db)
        result = train_model(X, y, model_type="scorer")

        assert result["model"] is not None
        assert 0 <= result["metrics"]["precision"] <= 1
        assert 0 <= result["metrics"]["recall"] <= 1
        assert 0 <= result["metrics"]["f1"] <= 1
        assert 0 <= result["metrics"]["auc"] <= 1
        assert 0 < result["metrics"]["threshold"] < 1
        assert result["feature_importances"] is not None

    def test_train_blocker_targets_high_recall(self, test_db):
        from app.services.ml_training import extract_training_data, train_model

        _seed_reviewed_candidates(test_db, count=100, confirm_ratio=0.5)
        test_db.flush()

        X, y = extract_training_data(test_db)
        # Blocker uses jaro_winkler (0), token_jaccard (1), name_length_ratio (6)
        X_blocker = X[:, [0, 1, 6]]
        result = train_model(X_blocker, y, model_type="blocker")

        assert result["model"] is not None
        # Blocker threshold should be set for high recall
        assert result["metrics"]["threshold"] < 0.5  # Low threshold = high recall


class TestSaveLoadModel:
    def test_save_and_load_roundtrip(self, test_db):
        from app.services.ml_training import (
            extract_training_data, train_model, save_model, load_active_model,
        )

        _seed_reviewed_candidates(test_db, count=80, confirm_ratio=0.5)
        test_db.flush()

        X, y = extract_training_data(test_db)
        result = train_model(X, y, model_type="scorer")

        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("app.services.ml_training.MODEL_DIR", tmpdir):
                save_model(
                    model=result["model"],
                    model_type="scorer",
                    feature_names=["jaro_winkler", "token_jaccard", "embedding_cosine",
                                   "short_name_match", "currency_match", "contact_match",
                                   "name_length_ratio", "token_count_diff"],
                    metrics=result["metrics"],
                    feature_importances=result["feature_importances"],
                    sample_count=80,
                    db=test_db,
                    created_by="testuser",
                )
                test_db.flush()

                bundle = load_active_model(test_db, "scorer", model_dir=tmpdir)

        assert bundle is not None
        assert bundle.threshold == result["metrics"]["threshold"]
        assert len(bundle.feature_names) == 8

    def test_load_returns_none_when_no_model(self, test_db):
        from app.services.ml_training import load_active_model

        bundle = load_active_model(test_db, "scorer")
        assert bundle is None

    def test_new_model_deactivates_old(self, test_db):
        from app.services.ml_training import (
            extract_training_data, train_model, save_model,
        )

        _seed_reviewed_candidates(test_db, count=80, confirm_ratio=0.5)
        test_db.flush()

        X, y = extract_training_data(test_db)
        result = train_model(X, y, model_type="scorer")

        feature_names = ["jaro_winkler", "token_jaccard", "embedding_cosine",
                         "short_name_match", "currency_match", "contact_match",
                         "name_length_ratio", "token_count_diff"]

        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("app.services.ml_training.MODEL_DIR", tmpdir):
                save_model(result["model"], "scorer", feature_names,
                           result["metrics"], result["feature_importances"], 80, test_db)
                test_db.flush()

                # Save a second model
                save_model(result["model"], "scorer", feature_names,
                           result["metrics"], result["feature_importances"], 80, test_db)
                test_db.flush()

        # Only one should be active
        active_count = (
            test_db.query(MLModelVersion)
            .filter(MLModelVersion.model_type == "scorer", MLModelVersion.is_active == True)
            .count()
        )
        assert active_count == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_ml_training.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.ml_training'`

- [ ] **Step 3: Implement ml_training.py**

Create `backend/app/services/ml_training.py`:

```python
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
    """Extract feature matrix and labels from confirmed/rejected candidates.

    Returns:
        (X, y) where X is (n_samples, 8) and y is (n_samples,) with 1=confirmed, 0=rejected.
    """
    candidates = (
        db.query(MatchCandidate)
        .filter(MatchCandidate.status.in_(["confirmed", "rejected"]))
        .all()
    )

    if not candidates:
        return np.empty((0, 8)), np.empty(0)

    # Collect all supplier IDs needed
    supplier_ids = set()
    for c in candidates:
        supplier_ids.add(c.supplier_a_id)
        supplier_ids.add(c.supplier_b_id)

    # Batch-load suppliers
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

        # 6 base signals
        base = [
            signals.get("jaro_winkler", 0.0),
            signals.get("token_jaccard", 0.0),
            signals.get("embedding_cosine", 0.0),
            signals.get("short_name_match", 0.0),
            signals.get("currency_match", 0.0),
            signals.get("contact_match", 0.0),
        ]

        # 2 engineered features
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
    """Train a LightGBM binary classifier.

    Args:
        X: Feature matrix.
        y: Label vector (1=match, 0=not match).
        model_type: "scorer" or "blocker".

    Returns:
        Dict with model, metrics, feature_importances.
    """
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42,
    )

    feature_names = BLOCKER_FEATURE_NAMES if model_type == "blocker" else SCORER_FEATURE_NAMES
    # Trim feature names to match actual column count
    feature_names = feature_names[:X.shape[1]]

    train_data = lgb.Dataset(X_train, label=y_train, feature_name=feature_names)
    valid_data = lgb.Dataset(X_test, label=y_test, feature_name=feature_names, reference=train_data)

    model = lgb.train(
        {k: v for k, v in LGB_PARAMS.items() if k != "n_estimators"},
        train_data,
        num_boost_round=LGB_PARAMS["n_estimators"],
        valid_sets=[valid_data],
    )

    # Predict probabilities on test set
    y_prob = model.predict(X_test)

    # Find optimal threshold
    if model_type == "blocker":
        # Blocker: find threshold where recall >= 0.98
        precision_arr, recall_arr, thresholds = precision_recall_curve(y_test, y_prob)
        # Find operating point with recall >= 0.98
        candidates_idx = np.where(recall_arr >= 0.98)[0]
        if len(candidates_idx) > 0:
            # Pick the one with highest precision among those with recall >= 0.98
            best_idx = candidates_idx[np.argmax(precision_arr[candidates_idx])]
            threshold = float(thresholds[best_idx]) if best_idx < len(thresholds) else 0.1
        else:
            threshold = 0.1  # Very low threshold to maximize recall
    else:
        # Scorer: find threshold that maximizes F1
        precision_arr, recall_arr, thresholds = precision_recall_curve(y_test, y_prob)
        f1_scores = 2 * precision_arr * recall_arr / (precision_arr + recall_arr + 1e-10)
        best_idx = np.argmax(f1_scores)
        threshold = float(thresholds[best_idx]) if best_idx < len(thresholds) else 0.5

    # Compute metrics at optimal threshold
    y_pred = (y_prob >= threshold).astype(int)
    metrics = {
        "precision": float(precision_score(y_test, y_pred, zero_division=0)),
        "recall": float(recall_score(y_test, y_pred, zero_division=0)),
        "f1": float(f1_score(y_test, y_pred, zero_division=0)),
        "auc": float(roc_auc_score(y_test, y_prob)),
        "threshold": threshold,
    }

    # Feature importances
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
    """Save model to disk and record metadata in DB.

    Deactivates any previous active model of the same type.
    """
    os.makedirs(MODEL_DIR, exist_ok=True)

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"{model_type}_{timestamp}.lgbm"
    filepath = os.path.join(MODEL_DIR, filename)

    model.save_model(filepath)

    # Deactivate previous active model of this type
    db.query(MLModelVersion).filter(
        MLModelVersion.model_type == model_type,
        MLModelVersion.is_active == True,
    ).update({"is_active": False}, synchronize_session="fetch")

    # Create new version
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

    # Cleanup old model files (keep last MAX_KEPT_VERSIONS)
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
    """Load the active model for the given type.

    Returns ModelBundle or None if no active model exists.
    """
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_ml_training.py -v`
Expected: All pass (9 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ml_training.py backend/tests/test_ml_training.py
git commit -m "feat: add ML training service with feature extraction, training, save/load"
```

---

### Task 4: ML Scoring service

**Files:**
- Create: `backend/app/services/ml_scoring.py`
- Create: `backend/tests/test_ml_scoring.py`

**Context:** This service provides `ml_score_pair` (replaces `score_pair` when an ML model is active) and `blocker_filter` (pre-filters candidate pairs). It reuses the signal computation from `scoring.py` and adds engineered features for inference.

- [ ] **Step 1: Write tests for ML scoring**

Create `backend/tests/test_ml_scoring.py`:

```python
"""Tests for ML scoring and blocker inference."""

import tempfile
from unittest.mock import patch, MagicMock

import numpy as np
import pytest
import lightgbm as lgb

from app.models.source import DataSource
from app.models.batch import ImportBatch
from app.models.staging import StagedSupplier
from app.services.ml_training import ModelBundle


def _make_supplier(db, source, batch, name, **kwargs):
    defaults = dict(
        import_batch_id=batch.id, data_source_id=source.id,
        name=name, normalized_name=name.lower(),
        source_code="C001", short_name="TST", currency="EUR",
        raw_data={"name": name}, status="active",
    )
    defaults.update(kwargs)
    s = StagedSupplier(**defaults)
    db.add(s)
    db.flush()
    return s


def _seed_pair(db):
    s = DataSource(name="S", file_format="csv", column_mapping={"supplier_name": "n"})
    db.add(s)
    db.flush()
    b = ImportBatch(data_source_id=s.id, filename="x.csv", uploaded_by="u", status="completed", row_count=2)
    db.add(b)
    db.flush()
    sup_a = _make_supplier(db, s, b, "ACME CORP")
    sup_b = _make_supplier(db, s, b, "ACME CORPORATION", source_code="C002")
    return sup_a, sup_b


def _make_mock_bundle(feature_count=8, predict_value=0.85):
    """Create a mock ModelBundle with a mock Booster."""
    mock_model = MagicMock(spec=lgb.Booster)
    mock_model.predict.return_value = np.array([predict_value])

    if feature_count == 8:
        names = ["jaro_winkler", "token_jaccard", "embedding_cosine",
                 "short_name_match", "currency_match", "contact_match",
                 "name_length_ratio", "token_count_diff"]
    else:
        names = ["jaro_winkler", "token_jaccard", "name_length_ratio"]

    return ModelBundle(model=mock_model, threshold=0.5, feature_names=names)


class TestMlScorePair:
    def test_returns_confidence_and_signals(self, test_db):
        from app.services.ml_scoring import ml_score_pair

        sup_a, sup_b = _seed_pair(test_db)
        bundle = _make_mock_bundle(predict_value=0.85)

        result = ml_score_pair(sup_a, sup_b, bundle)

        assert 0 <= result["confidence"] <= 1
        assert result["confidence"] == 0.85
        assert "signals" in result
        assert set(result["signals"].keys()) == {
            "jaro_winkler", "token_jaccard", "embedding_cosine",
            "short_name_match", "currency_match", "contact_match",
        }

    def test_model_receives_8_features(self, test_db):
        from app.services.ml_scoring import ml_score_pair

        sup_a, sup_b = _seed_pair(test_db)
        bundle = _make_mock_bundle()

        ml_score_pair(sup_a, sup_b, bundle)

        # Verify model.predict was called with 8-feature vector
        call_args = bundle.model.predict.call_args
        features = call_args[0][0]
        assert features.shape == (1, 8)


class TestBlockerFilter:
    def test_filters_low_confidence_pairs(self, test_db):
        from app.services.ml_scoring import blocker_filter

        s = DataSource(name="S", file_format="csv", column_mapping={"supplier_name": "n"})
        test_db.add(s)
        test_db.flush()
        b = ImportBatch(data_source_id=s.id, filename="x.csv", uploaded_by="u", status="completed", row_count=4)
        test_db.add(b)
        test_db.flush()

        sup1 = _make_supplier(test_db, s, b, "ALPHA INC", source_code="A1")
        sup2 = _make_supplier(test_db, s, b, "ALPHA INCORPORATED", source_code="A2")
        sup3 = _make_supplier(test_db, s, b, "BETA LLC", source_code="B1")
        sup4 = _make_supplier(test_db, s, b, "GAMMA CORP", source_code="G1")

        pairs = [(sup1.id, sup2.id), (sup3.id, sup4.id)]
        supplier_lookup = {s.id: s for s in [sup1, sup2, sup3, sup4]}

        # Mock: first pair passes (0.8 > 0.3 threshold), second fails (0.1 < 0.3)
        mock_model = MagicMock(spec=lgb.Booster)
        mock_model.predict.return_value = np.array([0.8, 0.1])

        bundle = ModelBundle(
            model=mock_model, threshold=0.3,
            feature_names=["jaro_winkler", "token_jaccard", "name_length_ratio"],
        )

        filtered = blocker_filter(pairs, supplier_lookup, bundle)
        assert len(filtered) == 1
        assert filtered[0] == (sup1.id, sup2.id)

    def test_no_bundle_passes_all(self):
        from app.services.ml_scoring import blocker_filter

        pairs = [(1, 2), (3, 4)]
        # No bundle = no filtering
        filtered = blocker_filter(pairs, {}, None)
        assert filtered == pairs


class TestEngineeredFeatures:
    def test_name_length_ratio(self):
        from app.services.ml_training import _compute_engineered_features

        nlr, tcd = _compute_engineered_features("ACME", "ACME CORP")
        assert 0 < nlr <= 1.0
        assert nlr == len("ACME") / len("ACME CORP")  # 4/9

    def test_token_count_diff(self):
        from app.services.ml_training import _compute_engineered_features

        nlr, tcd = _compute_engineered_features("ACME CORP INC", "ACME")
        assert tcd == 2  # 3 tokens - 1 token
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_ml_scoring.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.ml_scoring'`

- [ ] **Step 3: Implement ml_scoring.py**

Create `backend/app/services/ml_scoring.py`:

```python
"""ML scoring service — inference with trained LightGBM models.

Provides:
- ml_score_pair: Score a supplier pair using the ML scorer model
- blocker_filter: Pre-filter candidate pairs using the blocker model
"""

import numpy as np
from rapidfuzz.distance import JaroWinkler
from rapidfuzz import fuzz

from app.models.staging import StagedSupplier
from app.services.ml_training import ModelBundle, _compute_engineered_features
from app.services.scoring import score_pair as weighted_score_pair


def ml_score_pair(
    supplier_a: StagedSupplier,
    supplier_b: StagedSupplier,
    bundle: ModelBundle,
) -> dict:
    """Score a pair using the ML model.

    Computes 6 base signals (reuses existing signal code) + 2 engineered features.
    Returns dict with 'confidence' (model probability) and 'signals' (all 6 base signals).
    """
    # Compute all 6 base signals via the existing scorer (ignore its confidence)
    base_result = weighted_score_pair(supplier_a, supplier_b)
    signals = base_result["signals"]

    # Compute engineered features
    name_a = supplier_a.normalized_name or supplier_a.name or ""
    name_b = supplier_b.normalized_name or supplier_b.name or ""
    nlr, tcd = _compute_engineered_features(name_a, name_b)

    # Build feature vector in the order the model expects
    feature_vector = np.array([[
        signals["jaro_winkler"],
        signals["token_jaccard"],
        signals["embedding_cosine"],
        signals["short_name_match"],
        signals["currency_match"],
        signals["contact_match"],
        nlr,
        tcd,
    ]])

    # Model predicts probability of match
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
    """Filter candidate pairs using the blocker model.

    Args:
        pairs: List of (supplier_a_id, supplier_b_id) tuples.
        supplier_lookup: Dict mapping supplier ID to StagedSupplier.
        bundle: ModelBundle for blocker, or None to skip filtering.

    Returns:
        Filtered list of pairs that pass the blocker threshold.
    """
    if bundle is None or not pairs:
        return pairs

    # Compute 3 fast features for all pairs in batch
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

    return [
        pair for pair, prob in zip(valid_pairs, probs)
        if prob >= bundle.threshold
    ]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_ml_scoring.py -v`
Expected: All pass (6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ml_scoring.py backend/tests/test_ml_scoring.py
git commit -m "feat: add ML scoring service with ml_score_pair and blocker_filter"
```

---

### Task 5: Pipeline integration — wire ML into matching.py

**Files:**
- Modify: `backend/app/services/matching.py`
- Modify: `backend/tests/test_matching_service.py` (extend)

**Context:** The pipeline at `matching.py:95-289` currently calls `score_pair` for each pair. When an ML model is active, it should use `ml_score_pair` instead. The blocker should run after `combine_blocks` (line 158) and before the scoring loop. Fallback to weighted-sum when no model exists.

- [ ] **Step 1: Write tests for ML integration in pipeline**

Add to `backend/tests/test_matching_service.py` (append at end of file):

```python
class TestMLPipelineIntegration:
    """Test that the pipeline uses ML scorer/blocker when available."""

    @staticmethod
    def _seed_two_source_scenario(db):
        """Create a minimal two-source scenario and return (batch_id, s1, s2)."""
        src1 = _make_source(db, "ML Entity A")
        src2 = _make_source(db, "ML Entity B")
        batch1 = _make_batch(db, src1)
        batch2 = _make_batch(db, src2)
        s1 = _make_supplier(db, batch1, src1, "Acme Corp")
        s2 = _make_supplier(db, batch2, src2, "Acme Corporation")
        db.flush()
        return batch1.id, s1, s2

    @patch("app.services.matching.embedding_block")
    @patch("app.services.matching.text_block")
    def test_pipeline_uses_ml_scorer_when_model_exists(
        self, mock_text_block, mock_embedding_block, test_db
    ):
        """Pipeline should use ml_score_pair when a scorer model is active."""
        from unittest.mock import MagicMock
        from app.services.ml_training import ModelBundle
        import numpy as np

        batch_id, s1, s2 = self._seed_two_source_scenario(test_db)

        mock_text_block.return_value = {(s1.id, s2.id)}
        mock_embedding_block.return_value = set()

        mock_model = MagicMock()
        mock_model.predict.return_value = np.array([0.9])
        scorer_bundle = ModelBundle(
            model=mock_model, threshold=0.5,
            feature_names=["jaro_winkler", "token_jaccard", "embedding_cosine",
                           "short_name_match", "currency_match", "contact_match",
                           "name_length_ratio", "token_count_diff"],
        )

        with patch("app.services.matching.load_active_model") as mock_load:
            mock_load.side_effect = lambda db, t, **kw: scorer_bundle if t == "scorer" else None
            with patch("app.services.matching.ml_score_pair") as mock_ml_score:
                mock_ml_score.return_value = {"confidence": 0.9, "signals": {
                    "jaro_winkler": 0.9, "token_jaccard": 0.8, "embedding_cosine": 0.85,
                    "short_name_match": 1.0, "currency_match": 1.0, "contact_match": 0.7,
                }}

                from app.services.matching import run_matching_pipeline
                result = run_matching_pipeline(test_db, batch_id)

                # ml_score_pair should have been called
                assert mock_ml_score.called

    @patch("app.services.matching.embedding_block")
    @patch("app.services.matching.text_block")
    @patch("app.services.matching.score_pair")
    def test_pipeline_falls_back_to_weighted_sum(
        self, mock_score_pair, mock_text_block, mock_embedding_block, test_db
    ):
        """Pipeline should use score_pair when no ML model exists."""
        batch_id, s1, s2 = self._seed_two_source_scenario(test_db)

        mock_text_block.return_value = {(s1.id, s2.id)}
        mock_embedding_block.return_value = set()
        mock_score_pair.return_value = {
            "confidence": 0.85,
            "signals": {
                "jaro_winkler": 0.9, "token_jaccard": 0.8, "embedding_cosine": 0.7,
                "short_name_match": 0.5, "currency_match": 0.5, "contact_match": 0.5,
            },
        }

        with patch("app.services.matching.load_active_model", return_value=None):
            from app.services.matching import run_matching_pipeline
            result = run_matching_pipeline(test_db, batch_id)
            assert result["candidate_count"] == 1
            # score_pair (weighted-sum) should have been called, not ml_score_pair
            assert mock_score_pair.called
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_matching_service.py::TestMLPipelineIntegration -v`
Expected: FAIL — `load_active_model` and `ml_score_pair` not imported in matching.py

- [ ] **Step 3: Modify matching.py to integrate ML models**

In `backend/app/services/matching.py`, make these changes:

**Add imports** (after existing imports, around line 11):

```python
from app.services.ml_scoring import ml_score_pair, blocker_filter
from app.services.ml_training import load_active_model
```

**Load ML models** at the start of `run_matching_pipeline`, after the `source_ids < 2` early return (after line 133), add:

```python
    # Load ML models (None if no trained model exists)
    scorer_bundle = load_active_model(db, "scorer")
    blocker_bundle = load_active_model(db, "blocker")
    using_ml = scorer_bundle is not None
    if using_ml:
        logger.info("Using ML scorer model for this pipeline run")
    else:
        logger.info("No ML model — using weighted-sum scorer")
```

**Add blocker step** after `combine_blocks` and before the scoring loop. Replace lines 161-164 (the `if not all_pairs` check) with:

```python
    logger.info("Blocking produced %d candidate pairs", len(all_pairs))

    if not all_pairs:
        return {"candidate_count": 0, "group_count": 0}

    # Step 1.5: LEARNED BLOCKER (prune pairs before full scoring)
    if blocker_bundle is not None:
        # Build supplier lookup for blocker
        blocker_supplier_ids = set()
        for a_id, b_id in all_pairs:
            blocker_supplier_ids.add(a_id)
            blocker_supplier_ids.add(b_id)
        blocker_suppliers = (
            db.query(StagedSupplier)
            .filter(StagedSupplier.id.in_(blocker_supplier_ids))
            .all()
        )
        blocker_lookup = {s.id: s for s in blocker_suppliers}

        pre_filter_count = len(all_pairs)
        all_pairs = set(blocker_filter(list(all_pairs), blocker_lookup, blocker_bundle))
        logger.info("Blocker pruned %d → %d pairs", pre_filter_count, len(all_pairs))

        if not all_pairs:
            return {"candidate_count": 0, "group_count": 0}
```

**Replace the scoring call** in the scoring loop. Change line 203:

```python
        # From:
        result = score_pair(supplier_a, supplier_b, weights=signal_weights)
        # To:
        if using_ml:
            result = ml_score_pair(supplier_a, supplier_b, scorer_bundle)
        else:
            result = score_pair(supplier_a, supplier_b, weights=signal_weights)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_matching_service.py -v`
Expected: All pass (existing + new tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/matching.py backend/tests/test_matching_service.py
git commit -m "feat: integrate ML scorer and blocker into matching pipeline"
```

---

### Task 6: Train-Model API endpoint

**Files:**
- Modify: `backend/app/schemas/matching.py`
- Modify: `backend/app/routers/matching.py`
- Create: `backend/tests/test_ml_api.py`

**Context:** `POST /api/matching/train-model` triggers training. Any authenticated user can call it (the codebase has no admin role system — `User` model has only `id`, `username`, `password_hash`, `is_active`, `created_at`). Uses PostgreSQL advisory lock for concurrency; tests run on SQLite where advisory locks are not available, so the lock is skipped gracefully.

- [ ] **Step 1: Write tests for the train-model endpoint**

Create `backend/tests/test_ml_api.py`:

```python
"""Tests for ML training API endpoint."""

import tempfile
from unittest.mock import patch

import numpy as np
import pytest

from app.models.source import DataSource
from app.models.batch import ImportBatch
from app.models.staging import StagedSupplier
from app.models.match import MatchCandidate


def _seed_reviewed(db, count=60, confirm_ratio=0.5):
    """Seed reviewed candidates for training."""
    s1 = DataSource(name="S1", file_format="csv", column_mapping={"supplier_name": "n"})
    s2 = DataSource(name="S2", file_format="csv", column_mapping={"supplier_name": "n"})
    db.add_all([s1, s2])
    db.flush()
    b1 = ImportBatch(data_source_id=s1.id, filename="a.csv", uploaded_by="u", status="completed", row_count=count)
    b2 = ImportBatch(data_source_id=s2.id, filename="b.csv", uploaded_by="u", status="completed", row_count=count)
    db.add_all([b1, b2])
    db.flush()

    num_confirmed = int(count * confirm_ratio)
    for i in range(count):
        name_a = f"CORP {i}" if i < num_confirmed else f"ALPHA {i}"
        name_b = f"CORPORATION {i}" if i < num_confirmed else f"BETA {i}"
        status = "confirmed" if i < num_confirmed else "rejected"

        sa = StagedSupplier(
            import_batch_id=b1.id, data_source_id=s1.id,
            name=name_a, normalized_name=name_a.lower(),
            source_code=f"A{i}", raw_data={}, status="active",
        )
        sb = StagedSupplier(
            import_batch_id=b2.id, data_source_id=s2.id,
            name=name_b, normalized_name=name_b.lower(),
            source_code=f"B{i}", raw_data={}, status="active",
        )
        db.add_all([sa, sb])
        db.flush()

        signals = {
            "jaro_winkler": 0.8 if status == "confirmed" else 0.3,
            "token_jaccard": 0.7 if status == "confirmed" else 0.2,
            "embedding_cosine": 0.85 if status == "confirmed" else 0.4,
            "short_name_match": 1.0 if status == "confirmed" else 0.0,
            "currency_match": 1.0 if status == "confirmed" else 0.5,
            "contact_match": 0.6 if status == "confirmed" else 0.2,
        }
        mc = MatchCandidate(
            supplier_a_id=sa.id, supplier_b_id=sb.id,
            confidence=0.7 if status == "confirmed" else 0.3,
            match_signals=signals, status=status, reviewed_by="reviewer",
        )
        db.add(mc)
    db.flush()


class TestTrainModelEndpoint:
    def test_train_returns_metrics(self, authenticated_client, test_db):
        _seed_reviewed(test_db, count=80, confirm_ratio=0.5)
        test_db.commit()

        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("app.services.ml_training.MODEL_DIR", tmpdir):
                resp = authenticated_client.post("/api/matching/train-model")

        assert resp.status_code == 200
        data = resp.json()

        assert "scorer" in data
        assert "blocker" in data

        scorer = data["scorer"]
        assert scorer["sample_count"] == 80
        assert 0 <= scorer["metrics"]["precision"] <= 1
        assert 0 <= scorer["metrics"]["recall"] <= 1
        assert 0 <= scorer["metrics"]["f1"] <= 1
        assert 0 <= scorer["metrics"]["auc"] <= 1
        assert scorer["feature_importances"] is not None

        blocker = data["blocker"]
        assert blocker["sample_count"] == 80

    def test_train_insufficient_data(self, authenticated_client, test_db):
        _seed_reviewed(test_db, count=20, confirm_ratio=0.5)
        test_db.commit()

        resp = authenticated_client.post("/api/matching/train-model")
        assert resp.status_code == 400
        assert "50" in resp.json()["detail"]

    def test_train_single_class_returns_400(self, authenticated_client, test_db):
        """Training with only confirmed (no rejected) candidates returns 400."""
        _seed_reviewed(test_db, count=60, confirm_ratio=1.0)  # all confirmed
        test_db.commit()

        resp = authenticated_client.post("/api/matching/train-model")
        assert resp.status_code == 400
        assert "both" in resp.json()["detail"].lower()

    def test_train_requires_auth(self, test_client):
        resp = test_client.post("/api/matching/train-model")
        assert resp.status_code == 401
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_ml_api.py -v`
Expected: FAIL — endpoint doesn't exist yet (404).

- [ ] **Step 3: Add TrainModelResponse schema**

In `backend/app/schemas/matching.py`, add after `RetrainResponse`:

```python
class ModelTrainingResult(BaseModel):
    """Result for a single model (scorer or blocker)."""
    model_id: int
    sample_count: int
    metrics: dict
    feature_importances: dict | None = None
    threshold: float


class TrainModelResponse(BaseModel):
    """Response from ML model training."""
    scorer: ModelTrainingResult
    blocker: ModelTrainingResult
```

- [ ] **Step 4: Add train-model endpoint to matching router**

In `backend/app/routers/matching.py`, add the import for new schemas and training service. Then add the endpoint after the existing `/retrain` endpoint:

Add to imports:

```python
from sqlalchemy import text

from app.schemas.matching import (
    MatchCandidateResponse,
    MatchGroupResponse,
    RetrainResponse,
    TrainModelResponse,
    ModelTrainingResult,
)
from app.services.ml_training import (
    extract_training_data,
    train_model,
    save_model,
    MIN_TRAINING_SAMPLES,
    SCORER_FEATURE_NAMES,
    BLOCKER_FEATURE_NAMES,
)
```

Add endpoint:

```python
@router.post("/train-model", response_model=TrainModelResponse)
def train_ml_model(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Train ML scorer and blocker models from reviewed match candidates.

    Requires at least 50 confirmed/rejected candidates with both classes present.
    Acquires a PostgreSQL advisory lock to prevent concurrent training.
    """
    # Advisory lock to prevent concurrent training (skip on SQLite)
    try:
        db.execute(text("SELECT pg_advisory_xact_lock(737373)"))
    except Exception:
        pass  # SQLite or other DBs without advisory locks

    # Extract training data
    X, y = extract_training_data(db)

    if len(y) < MIN_TRAINING_SAMPLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient training data — need at least {MIN_TRAINING_SAMPLES} "
                   f"reviewed candidates, found {len(y)}",
        )

    if len(set(y)) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Training data must include both confirmed and rejected candidates",
        )

    # Train scorer (all 8 features)
    scorer_result = train_model(X, y, model_type="scorer")
    scorer_version = save_model(
        model=scorer_result["model"],
        model_type="scorer",
        feature_names=SCORER_FEATURE_NAMES,
        metrics=scorer_result["metrics"],
        feature_importances=scorer_result["feature_importances"],
        sample_count=len(y),
        db=db,
        created_by=current_user.username,
    )

    # Train blocker (3 fast features: jaro_winkler, token_jaccard, name_length_ratio)
    X_blocker = X[:, [0, 1, 6]]  # indices for jaro_winkler, token_jaccard, name_length_ratio
    blocker_result = train_model(X_blocker, y, model_type="blocker")
    blocker_version = save_model(
        model=blocker_result["model"],
        model_type="blocker",
        feature_names=BLOCKER_FEATURE_NAMES,
        metrics=blocker_result["metrics"],
        feature_importances=blocker_result["feature_importances"],
        sample_count=len(y),
        db=db,
        created_by=current_user.username,
    )

    db.commit()

    return TrainModelResponse(
        scorer=ModelTrainingResult(
            model_id=scorer_version.id,
            sample_count=len(y),
            metrics=scorer_result["metrics"],
            feature_importances=scorer_result["feature_importances"],
            threshold=scorer_result["metrics"]["threshold"],
        ),
        blocker=ModelTrainingResult(
            model_id=blocker_version.id,
            sample_count=len(y),
            metrics=blocker_result["metrics"],
            feature_importances=blocker_result["feature_importances"],
            threshold=blocker_result["metrics"]["threshold"],
        ),
    )
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_ml_api.py::TestTrainModelEndpoint -v`
Expected: All 4 pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/matching.py backend/app/routers/matching.py \
        backend/tests/test_ml_api.py
git commit -m "feat: add POST /api/matching/train-model endpoint"
```

---

### Task 7: Active Learning queue sort

**Files:**
- Modify: `backend/app/routers/review.py`
- Modify: `backend/tests/test_ml_api.py` (or new test file)

**Context:** The existing `GET /api/review/queue` (review.py:52) sorts by `confidence DESC`. Add a `sort` query parameter with values: `confidence_desc` (default), `confidence_asc`, `active_learning` (sort by `abs(confidence - 0.5)` ascending — most uncertain first). The sort uses the already-stored confidence value.

- [ ] **Step 1: Write tests for active learning sort**

Add to `backend/tests/test_ml_api.py`:

```python
class TestActiveLearningSort:
    def _seed_queue(self, db):
        s1 = DataSource(name="Q1", file_format="csv", column_mapping={"supplier_name": "n"})
        s2 = DataSource(name="Q2", file_format="csv", column_mapping={"supplier_name": "n"})
        db.add_all([s1, s2])
        db.flush()
        b1 = ImportBatch(data_source_id=s1.id, filename="a.csv", uploaded_by="u", status="completed", row_count=3)
        b2 = ImportBatch(data_source_id=s2.id, filename="b.csv", uploaded_by="u", status="completed", row_count=3)
        db.add_all([b1, b2])
        db.flush()

        pairs = []
        for i, conf in enumerate([0.9, 0.5, 0.3]):
            sa = StagedSupplier(
                import_batch_id=b1.id, data_source_id=s1.id,
                name=f"SUP A{i}", normalized_name=f"sup a{i}",
                source_code=f"QA{i}", raw_data={}, status="active",
            )
            sb = StagedSupplier(
                import_batch_id=b2.id, data_source_id=s2.id,
                name=f"SUP B{i}", normalized_name=f"sup b{i}",
                source_code=f"QB{i}", raw_data={}, status="active",
            )
            db.add_all([sa, sb])
            db.flush()
            mc = MatchCandidate(
                supplier_a_id=sa.id, supplier_b_id=sb.id,
                confidence=conf,
                match_signals={"jaro_winkler": conf, "token_jaccard": conf,
                               "embedding_cosine": conf, "short_name_match": 0,
                               "currency_match": 0, "contact_match": 0},
                status="pending",
            )
            db.add(mc)
            pairs.append(mc)
        db.flush()
        return pairs

    def test_default_sort_confidence_desc(self, authenticated_client, test_db):
        self._seed_queue(test_db)
        test_db.commit()

        resp = authenticated_client.get("/api/review/queue")
        items = resp.json()["items"]
        confs = [item["confidence"] for item in items]
        assert confs == sorted(confs, reverse=True)

    def test_sort_confidence_asc(self, authenticated_client, test_db):
        self._seed_queue(test_db)
        test_db.commit()

        resp = authenticated_client.get("/api/review/queue?sort=confidence_asc")
        items = resp.json()["items"]
        confs = [item["confidence"] for item in items]
        assert confs == sorted(confs)

    def test_sort_active_learning(self, authenticated_client, test_db):
        self._seed_queue(test_db)
        test_db.commit()

        resp = authenticated_client.get("/api/review/queue?sort=active_learning")
        items = resp.json()["items"]
        confs = [item["confidence"] for item in items]

        # Most uncertain (closest to 0.5) should be first
        uncertainties = [abs(c - 0.5) for c in confs]
        assert uncertainties == sorted(uncertainties)
        # 0.5 is most uncertain, then 0.3 (distance 0.2), then 0.9 (distance 0.4)
        assert confs[0] == 0.5

    def test_sort_invalid_value_returns_422(self, authenticated_client, test_db):
        resp = authenticated_client.get("/api/review/queue?sort=invalid")
        assert resp.status_code == 422
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_ml_api.py::TestActiveLearningSort -v`
Expected: FAIL — `sort` parameter not recognized.

- [ ] **Step 3: Add sort parameter to review queue endpoint**

In `backend/app/routers/review.py`, modify the `get_review_queue` function:

Add import at the top:

```python
from typing import Literal
```

Add `sort` parameter to the function signature (after `offset`):

```python
    sort: Literal["confidence_desc", "confidence_asc", "active_learning"] = Query(
        "confidence_desc", description="Sort order for the queue"
    ),
```

Replace the `.order_by(MatchCandidate.confidence.desc())` line (line 116) with:

```python
    # Apply sort order
    if sort == "confidence_asc":
        query = query.order_by(MatchCandidate.confidence.asc())
    elif sort == "active_learning":
        query = query.order_by(func.abs(MatchCandidate.confidence - 0.5).asc())
    else:  # confidence_desc (default)
        query = query.order_by(MatchCandidate.confidence.desc())
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_ml_api.py::TestActiveLearningSort -v`
Expected: All 4 pass.

- [ ] **Step 5: Run full test suite**

Run: `cd backend && python -m pytest -v`
Expected: All tests pass. (Note: `test_candidates_include_signals` may fail in full suite due to pre-existing SQLite isolation issue — this is a known issue on master.)

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/review.py backend/tests/test_ml_api.py
git commit -m "feat: add active learning sort option to review queue"
```

---

### Task 8: Final verification and migration

**Files:** None new — verification only.

- [ ] **Step 1: Run full test suite**

Run: `cd backend && python -m pytest -v`
Expected: All new tests pass. Pre-existing `test_candidates_include_signals` failure is acceptable (known SQLite isolation issue).

- [ ] **Step 2: Run Alembic migration against live DB**

Run: `cd backend && ENV_PROFILE=dev alembic upgrade head`
Expected: Migration 007 applied successfully.

- [ ] **Step 3: Verify train-model endpoint against live data**

If there are reviewed (confirmed/rejected) candidates in the live DB:

```bash
# Get auth token
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -d "username=admin&password=changeme" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Train model
curl -s -X POST http://localhost:8000/api/matching/train-model \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Expected: Either 200 with metrics (if 50+ reviewed candidates) or 400 with insufficient data message.

- [ ] **Step 4: Verify active learning sort**

```bash
curl -s "http://localhost:8000/api/review/queue?sort=active_learning" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Expected: Queue items sorted by uncertainty (closest to 0.5 confidence first).

- [ ] **Step 5: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "chore: final verification and cleanup for ML-enhanced matching"
```
