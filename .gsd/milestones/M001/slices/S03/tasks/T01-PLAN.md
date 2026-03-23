# T01: 02-matching-engine 01

**Slice:** S03 — **Milestone:** M001

## Description

Build the matching engine foundation: data model extensions, configuration, and the three core algorithm services (blocking, scoring, clustering) with comprehensive tests.

Purpose: Establish the computational core that Plan 02 orchestrates into a complete pipeline. All matching logic is pure, testable, and independent of Celery/orchestration concerns.
Output: MatchGroup model, matching config, Alembic migration, blocking/scoring/clustering services with tests

## Must-Haves

- [ ] "Text-based blocking produces candidate pairs from suppliers sharing normalized name prefix (3 chars) or first token"
- [ ] "Embedding-based blocking produces candidate pairs via pgvector ANN cosine distance search (K nearest neighbors)"
- [ ] "All 6 scoring signals compute a 0-1 score for any supplier pair"
- [ ] "Weighted confidence score is computed as sum of (signal * weight) for each pair"
- [ ] "Per-signal breakdowns are stored in match_signals dict for explainability"
- [ ] "Connected components algorithm detects transitive match groups with cluster size limits"

## Files

- `backend/app/models/match.py`
- `backend/app/models/__init__.py`
- `backend/app/models/batch.py`
- `backend/app/config.py`
- `backend/requirements.txt`
- `backend/alembic/versions/002_matching_engine.py`
- `backend/app/services/blocking.py`
- `backend/app/services/scoring.py`
- `backend/app/services/clustering.py`
- `backend/tests/test_blocking.py`
- `backend/tests/test_scoring.py`
- `backend/tests/test_clustering.py`
