# T02: 02-matching-engine 02

**Slice:** S03 — **Milestone:** M001

## Description

Build the matching orchestration service that wires blocking → scoring → clustering into a complete pipeline, replace the stub Celery task with full implementation, add retraining service, and create API endpoints for match results.

Purpose: Transform the algorithm services from Plan 01 into a working end-to-end pipeline that auto-runs after ingestion and exposes results via REST API.
Output: Matching orchestration service, full Celery task, retraining service, matching API router with schemas

## Must-Haves

- [ ] "After ingestion, matching task runs automatically and creates MatchCandidate records with status=pending for all pairs above confidence threshold"
- [ ] "Each MatchCandidate has per-signal breakdowns stored in match_signals JSONB"
- [ ] "MatchCandidates are assigned to MatchGroups via transitive clustering"
- [ ] "On re-upload, old match candidates involving that source are invalidated before new matching runs"
- [ ] "System can retrain signal weights using logistic regression from reviewer confirm/reject decisions"
- [ ] "API endpoints exist to list match groups and match candidates"

## Files

- `backend/app/services/matching.py`
- `backend/app/services/retraining.py`
- `backend/app/tasks/matching.py`
- `backend/app/routers/matching.py`
- `backend/app/schemas/matching.py`
- `backend/app/main.py`
- `backend/app/tasks/ingestion.py`
- `backend/tests/test_matching_service.py`
- `backend/tests/test_matching_api.py`
