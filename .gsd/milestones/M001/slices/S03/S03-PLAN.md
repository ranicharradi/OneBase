# S03: Matching Engine

**Goal:** Build the matching engine foundation: data model extensions, configuration, and the three core algorithm services (blocking, scoring, clustering) with comprehensive tests.
**Demo:** Build the matching engine foundation: data model extensions, configuration, and the three core algorithm services (blocking, scoring, clustering) with comprehensive tests.

## Must-Haves


## Tasks

- [x] **T01: 02-matching-engine 01** `est:9min`
  - Build the matching engine foundation: data model extensions, configuration, and the three core algorithm services (blocking, scoring, clustering) with comprehensive tests.

Purpose: Establish the computational core that Plan 02 orchestrates into a complete pipeline. All matching logic is pure, testable, and independent of Celery/orchestration concerns.
Output: MatchGroup model, matching config, Alembic migration, blocking/scoring/clustering services with tests
- [x] **T02: 02-matching-engine 02** `est:15min`
  - Build the matching orchestration service that wires blocking → scoring → clustering into a complete pipeline, replace the stub Celery task with full implementation, add retraining service, and create API endpoints for match results.

Purpose: Transform the algorithm services from Plan 01 into a working end-to-end pipeline that auto-runs after ingestion and exposes results via REST API.
Output: Matching orchestration service, full Celery task, retraining service, matching API router with schemas
- [x] **T03: 02-matching-engine 03** `est:45min`
  - Add WebSocket notification infrastructure and frontend toast system so users are notified when matching jobs complete or fail, with the ProgressTracker extended to show matching as the final pipeline stage.

Purpose: Close the feedback loop — users know when matching finishes without polling. The Upload page shows matching inline, other pages show a toast.
Output: WebSocket endpoint, Redis pub/sub bridge, notification hook, Toast component, extended ProgressTracker

## Files Likely Touched

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
- `backend/app/services/matching.py`
- `backend/app/services/retraining.py`
- `backend/app/tasks/matching.py`
- `backend/app/routers/matching.py`
- `backend/app/schemas/matching.py`
- `backend/app/main.py`
- `backend/app/tasks/ingestion.py`
- `backend/tests/test_matching_service.py`
- `backend/tests/test_matching_api.py`
- `backend/app/routers/ws.py`
- `backend/app/services/notifications.py`
- `backend/app/tasks/matching.py`
- `backend/app/main.py`
- `backend/tests/test_ws.py`
- `frontend/src/hooks/useMatchingNotifications.ts`
- `frontend/src/components/Toast.tsx`
- `frontend/src/components/ProgressTracker.tsx`
- `frontend/src/components/Layout.tsx`
- `frontend/src/api/types.ts`
