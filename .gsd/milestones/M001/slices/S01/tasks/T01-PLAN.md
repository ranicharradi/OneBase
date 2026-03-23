# T01: 01-foundation-ingestion-pipeline 01

**Slice:** S01 — **Milestone:** M001

## Description

Set up the entire Docker environment, backend project structure, database schema with all Phase 1 models, Alembic migrations, JWT authentication, audit trail, and test infrastructure.

Purpose: This is the foundation everything else builds on. No other plan can execute until Docker services run, the database has tables, and auth protects endpoints.
Output: Running Docker environment with working auth endpoints, all database tables created, test infrastructure ready.

## Must-Haves

- [ ] "Docker containers (postgres, redis, api, worker) start and stay healthy"
- [ ] "Database has all Phase 1 tables with pgvector extension enabled"
- [ ] "User can POST /api/auth/login with valid credentials and receive a JWT token"
- [ ] "Protected endpoints reject requests without valid JWT (401)"
- [ ] "Initial admin user is created from ADMIN_USERNAME/ADMIN_PASSWORD env vars on first startup"
- [ ] "User actions (login, user creation) are logged in the audit_log table"

## Files

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
