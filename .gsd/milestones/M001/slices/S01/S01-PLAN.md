# S01: Foundation Ingestion Pipeline

**Goal:** Set up the entire Docker environment, backend project structure, database schema with all Phase 1 models, Alembic migrations, JWT authentication, audit trail, and test infrastructure.
**Demo:** Set up the entire Docker environment, backend project structure, database schema with all Phase 1 models, Alembic migrations, JWT authentication, audit trail, and test infrastructure.

## Must-Haves


## Tasks

- [x] **T01: 01-foundation-ingestion-pipeline 01** `est:10min`
  - Set up the entire Docker environment, backend project structure, database schema with all Phase 1 models, Alembic migrations, JWT authentication, audit trail, and test infrastructure.

Purpose: This is the foundation everything else builds on. No other plan can execute until Docker services run, the database has tables, and auth protects endpoints.
Output: Running Docker environment with working auth endpoints, all database tables created, test infrastructure ready.
- [x] **T02: 01-foundation-ingestion-pipeline 02** `est:9min`
  - Build the complete ingestion pipeline backend: CSV parsing, data source CRUD, file upload, name normalization, embedding computation, re-upload supersession, and Celery task orchestration with progress tracking.

Purpose: This is the core data pipeline that processes supplier CSV exports from raw files into normalized, embedded staging records. Without this, there's no data to match or review.
Output: Working API endpoints for data source management and file upload, Celery worker that processes uploads through the full pipeline (parse → map → store → normalize → embed), re-upload lifecycle with supersession, and a matching stub task.
- [x] **T03: 01-foundation-ingestion-pipeline 03** `est:9min`
  - Set up the React frontend from scratch with Vite + TypeScript + Tailwind CSS 4, create the app shell with dark theme, build the login flow, and implement the Sources and Users management pages.

Purpose: Users need a frontend to interact with the system. This plan creates the full app scaffold, authentication UX, and management pages (Sources + Users) that are prerequisites for the upload experience in Plan 04.
Output: Working React app with login, dark-themed app shell with sidebar navigation, data source CRUD page, and user management page.
- [x] **T04: 01-foundation-ingestion-pipeline 04** `est:5min`
  - Build the complete upload experience: drag-and-drop file upload, column mapper for new sources, real-time pipeline progress tracker, re-upload confirmation dialog, and batch history.

Purpose: This is the primary user interaction for getting data into the system. The upload page is the most complex UI in Phase 1, combining file upload, dynamic column mapping, real-time progress feedback, and re-upload lifecycle — all per the user's locked decisions from CONTEXT.md.
Output: Fully functional upload page where users can upload CSV files, map columns for new sources, watch processing progress in real-time, and manage re-uploads with impact awareness.

## Files Likely Touched

- `docker-compose.yml`
- `.env.example`
- `backend/Dockerfile`
- `backend/entrypoint.sh`
- `backend/requirements.txt`
- `backend/app/main.py`
- `backend/app/config.py`
- `backend/app/database.py`
- `backend/app/dependencies.py`
- `backend/app/models/base.py`
- `backend/app/models/user.py`
- `backend/app/models/audit.py`
- `backend/app/models/source.py`
- `backend/app/models/batch.py`
- `backend/app/models/staging.py`
- `backend/app/models/match.py`
- `backend/alembic.ini`
- `backend/alembic/env.py`
- `backend/app/services/auth.py`
- `backend/app/services/audit.py`
- `backend/app/routers/auth.py`
- `backend/app/routers/users.py`
- `backend/app/schemas/auth.py`
- `backend/app/tasks/celery_app.py`
- `backend/pytest.ini`
- `backend/tests/conftest.py`
- `backend/tests/test_auth.py`
- `backend/tests/test_audit.py`
- `backend/app/utils/csv_parser.py`
- `backend/app/services/normalization.py`
- `backend/app/services/embedding.py`
- `backend/app/services/source.py`
- `backend/app/services/ingestion.py`
- `backend/app/routers/sources.py`
- `backend/app/routers/upload.py`
- `backend/app/schemas/source.py`
- `backend/app/schemas/upload.py`
- `backend/app/tasks/ingestion.py`
- `backend/app/tasks/matching.py`
- `backend/tests/test_csv_parser.py`
- `backend/tests/test_normalization.py`
- `backend/tests/test_embedding.py`
- `backend/tests/test_sources.py`
- `backend/tests/test_upload.py`
- `backend/tests/test_reupload.py`
- `backend/tests/test_ingestion_task.py`
- `frontend/package.json`
- `frontend/tsconfig.json`
- `frontend/tsconfig.app.json`
- `frontend/tsconfig.node.json`
- `frontend/vite.config.ts`
- `frontend/index.html`
- `frontend/src/main.tsx`
- `frontend/src/App.tsx`
- `frontend/src/app.css`
- `frontend/src/api/client.ts`
- `frontend/src/api/types.ts`
- `frontend/src/hooks/useAuth.ts`
- `frontend/src/components/Layout.tsx`
- `frontend/src/components/ProtectedRoute.tsx`
- `frontend/src/pages/Login.tsx`
- `frontend/src/pages/Sources.tsx`
- `frontend/src/pages/Users.tsx`
- `frontend/Dockerfile`
- `frontend/src/pages/Upload.tsx`
- `frontend/src/components/DropZone.tsx`
- `frontend/src/components/ProgressTracker.tsx`
- `frontend/src/components/ColumnMapper.tsx`
- `frontend/src/components/ReUploadDialog.tsx`
- `frontend/src/components/BatchHistory.tsx`
- `frontend/src/hooks/useTaskStatus.ts`
- `frontend/src/api/types.ts`
