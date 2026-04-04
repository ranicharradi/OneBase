# OneBase Codebase Audit Report

**Date:** 2026-03-31
**Auditor:** Senior Full-Stack Architect (AI-assisted)
**Last reviewed:** 2026-04-04

## Executive Summary

OneBase is a **well-architected, domain-focused platform** with a clean separation between backend services, async task processing, and a modern React frontend. The core data pipeline (CSV ingestion → blocking → scoring → clustering → human review → merge) is the strongest part of the codebase — thoughtfully designed with multi-signal matching, field-level provenance, and ML-enhanced scoring. The backend service layer is modular, testable, and well-tested (~334 tests, ~6.3k test LOC against ~6.9k app LOC). The dependency stack is modern and appropriate, with no abandoned or risky libraries.

---

## Score Card

| Dimension | Score | Verdict |
|-----------|-------|---------|
| 1. Stack Fit | 4/5 | Excellent choices for the domain. Minor over-weight from sentence-transformers for what's essentially name matching. |
| 2. Project Structure & Modularity | 5/5 | Textbook layered architecture with clean module boundaries and consistent naming. |
| 3. Code Quality & Patterns | 4/5 | Clean, idiomatic code with no dead code or anti-patterns. Minor issues with some long router functions. |
| 4. Dependency Health | 4/5 | All deps are current mainstream releases. No lockfile for backend (pip). |
| 5. Configuration & Environment | 5/5 | Excellent — profile-based `.env` layering, production secret validation, all env vars documented. |
| 6. Testing Strategy | 4/5 | Strong backend unit test suite (334 tests). Frontend tests exist but are thin. |
| 7. Developer Workflow & Tooling | 4/5 | Pre-commit hooks, Makefile, linting, formatting all present. Makefile has a bug (hardcoded `.venv` path). |
| 8. CI/CD & Deployment | 3/5 | CI runs lint + test + security audit + build. No deployment pipeline. No Postgres integration tests in CI. |
| 9. Documentation | 4/5 | Excellent CLAUDE.md and project-structure doc. Backlog is self-aware. |
| 10. Security Posture | 4/5 | Solid: bcrypt, JWT, rate limiting, path traversal protection, security headers. Missing CSP header. |

---

## Open Issues

### 1. Worker `docker-compose.yml` hardcodes password — **5 min fix**
In `docker-compose.yml:69`, the `worker` service has `DATABASE_URL` defaulting to `changeme` while `api` (line 39) uses `${POSTGRES_PASSWORD:-changeme}`. If someone changes `POSTGRES_PASSWORD`, the worker breaks silently.

**Fix:** Change worker line to `${DATABASE_URL:-postgresql://onebase:${POSTGRES_PASSWORD:-changeme}@postgres:5432/onebase}` to match the `api` service pattern.

### 2. `pytest.ini` enforces `--cov-fail-under=70` but actual coverage is ~36% — **5 min fix**
`backend/pytest.ini:5` sets `--cov-fail-under=70`. CI overrides this by passing its own `--cov` args (`ci.yml:53`), so CI isn't broken — but local `pytest` runs without args will always fail the coverage gate.

**Fix:** Lower the threshold to the actual level (~36%) and set a realistic incremental target.

### 3. Add Content-Security-Policy header — **30 min**
`backend/app/main.py` adds security headers but omits `Content-Security-Policy`. The nginx config also lacks CSP. This is the single most impactful security header for XSS mitigation.

**Action:** Add a restrictive CSP in both the FastAPI middleware and `frontend/nginx.conf`.

### 4. Celery tasks create raw `SessionLocal()` — **30 min**
Both `backend/app/tasks/ingestion.py:30` and `backend/app/tasks/matching.py:33` create sessions manually with `SessionLocal()` and manage try/finally. If an exception occurs between session creation and the try block, the session leaks.

**Action:** Use a context manager or `@contextmanager` wrapper around `SessionLocal()` for guaranteed cleanup.

### 5. Add backend dependency lock file — **30 min**
There is no `requirements.lock` or `pip-compile`/`uv.lock`. `requirements.txt` uses pinned versions (good), but transitive dependencies aren't locked. A `pip install` at different times can produce different transitive dep trees.

**Action:** Add `pip-compile` (pip-tools) or migrate to `uv` for reproducible installs.

### 6. Add Postgres integration tests to CI — **1–2 hrs**
CI runs tests against SQLite only. The `FOR UPDATE` fallback in `backend/app/services/ingestion.py:96` and pgvector-specific code paths are never tested in CI. The `TEST_DATABASE_URL` mechanism already exists.

**Action:** Add a CI job with `services: postgres` that runs `TEST_DATABASE_URL=postgresql://... pytest`.

### 7. Fix Makefile — **15 min**
`Makefile:5` uses `source .venv/bin/activate` but Make targets run in `sh`, not `bash`. `source` is a bash-ism and the path references `backend/.venv` which doesn't exist (venv is at project root).

**Fix:** Change to `. ../.venv/bin/activate` or use the full Python path `.venv/bin/python -m pytest`.

### 8. `BaseHTTPMiddleware` usage in two places
Both `SecurityHeadersMiddleware` and `RequestIDMiddleware` in `backend/app/main.py` and `backend/app/logging_config.py` use `BaseHTTPMiddleware`, which Starlette discourages for production due to streaming response issues. Consider migrating to pure ASGI middleware.

---

## Resolved Since Original Audit

| Issue | Resolution |
|-------|-----------|
| No user update/delete/deactivate endpoints | `backend/app/routers/users.py` now has PUT update, DELETE, toggle-active, and change-password — all admin-protected with last-admin guards |
| Frontend pagination non-functional | `ReviewQueue.tsx` and `UnifiedSuppliers.tsx` now use `Pagination` component with `offset`/`limit` query params |
| Unused `_SIGNAL_LABELS` in ReviewQueue | Removed from codebase |

---

## Strengths (worth preserving)

- **Multi-signal scoring with dynamic weight redistribution** (`backend/app/services/scoring.py`) — genuinely well-engineered. Handles missing fields gracefully with 0.5 neutral scores and normalizes weights dynamically.
- **Field-level provenance on UnifiedSupplier** — a strong architectural decision that enables full auditability. The JSON structure in `backend/app/models/unified.py:18-30` is well-documented.
- **Path traversal protection** via `backend/app/utils/paths.py` (`safe_upload_path`) — correct implementation using `os.path.realpath`.
- **Legacy password hash migration** in `backend/app/services/auth.py:86-88` — silently upgrades PBKDF2 → bcrypt on login. Smart, transparent migration.
- **Test/prod database flexibility** — SQLite with StaticPool for tests, Postgres with pgvector for prod. The SQLite `FOR UPDATE` fallback is correctly handled.
- **Self-documenting backlog** — `docs/backlog/incomplete-features.md` is honest and specific about what's missing. Rare and valuable.
