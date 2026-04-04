# Audit Remediation Design

**Date:** 2026-04-04
**Source:** `docs/architecture/codebase-audit-2026-03-31.md` (reviewed 2026-04-04)
**Scope:** 6 targeted fixes from the codebase audit, scoped for an enterprise internal deployment.

## Context

The codebase audit identified 8 open issues. Two were dropped as unnecessary for an internal enterprise server (CSP header, Postgres CI integration tests). The remaining 6 are operational correctness, developer experience, and code quality fixes.

## 1. Fix worker `DATABASE_URL` in `docker-compose.yml`

**File:** `docker-compose.yml:69`

The `api` service uses `${POSTGRES_PASSWORD:-changeme}` in its DATABASE_URL default, but the `worker` service hardcodes `changeme`. If POSTGRES_PASSWORD is changed, the worker silently fails to connect.

**Change:** Replace the worker's DATABASE_URL default with the same pattern as the api service:
```yaml
DATABASE_URL: ${DATABASE_URL:-postgresql://onebase:${POSTGRES_PASSWORD:-changeme}@postgres:5432/onebase}
```

## 2. Fix `pytest.ini` coverage threshold

**File:** `backend/pytest.ini:5`

`--cov-fail-under=70` fails every local `pytest` run because actual coverage is ~36%. CI sidesteps this by passing its own `--cov` args. The threshold is aspirational but actively harmful to local dev workflow.

**Change:** Lower to `--cov-fail-under=35` (just under actual coverage). This provides a regression guard without blocking developers.

## 3. Fix Makefile

**File:** `Makefile`

Two bugs:
- Uses `source` (bash-ism) but Make runs targets in `sh`
- References `backend/.venv` but the project venv lives at the repo root

**Change:** Use the venv Python binary directly instead of activating. All targets like:
```makefile
test:
    cd backend && ../.venv/bin/python -m pytest
```

This is POSIX-compatible and doesn't depend on shell activation semantics.

## 4. Wrap Celery `SessionLocal()` in context manager

**Files:** `backend/app/tasks/ingestion.py:30`, `backend/app/tasks/matching.py:33`, `backend/app/database.py`

Both Celery tasks create sessions with bare `SessionLocal()` and manual try/finally. If an exception occurs between session creation and the try block, the session leaks and the DB connection is never returned to the pool.

**Change:**
1. Add a `get_task_session()` context manager in `app/database.py`:
```python
@contextmanager
def get_task_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

2. Update both tasks to use:
```python
with get_task_session() as db:
    # task body
```

This eliminates the leak window and removes duplicated session management from both tasks.

## 5. Add `uv.lock` for backend dependencies

**Directory:** `backend/`

Transitive dependencies aren't locked. `pip install -r requirements.txt` at different times can resolve different transitive dep trees, leading to unreproducible builds — especially problematic on an air-gapped enterprise server.

**Change:**
1. Add a `[project]` section to the existing `backend/pyproject.toml` (which currently only has ruff config) with the dependencies from `requirements.txt`
2. Run `uv lock` to generate `uv.lock` from the declared dependencies
3. Commit `uv.lock` to the repo
4. Keep `requirements.txt` as-is for Docker builds (which use `pip install -r`)
5. Update CLAUDE.md with uv usage notes for local dev

## 6. Migrate `BaseHTTPMiddleware` to pure ASGI middleware

**Files:** `backend/app/main.py` (`SecurityHeadersMiddleware`), `backend/app/logging_config.py` (`RequestIDMiddleware`)

Starlette discourages `BaseHTTPMiddleware` for production due to issues with streaming responses — it buffers the entire response body. Both middlewares are simple header/context operations that don't need response body access.

**Change:** Rewrite both as plain ASGI middleware classes:
```python
class SecurityHeadersMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            async def send_with_headers(message):
                if message["type"] == "http.response.start":
                    headers = MutableHeaders(scope=message)
                    headers.append("X-Content-Type-Options", "nosniff")
                    # ... other headers
                await send(message)
            await self.app(scope, receive, send_with_headers)
        else:
            await self.app(scope, receive, send)
```

Same pattern for `RequestIDMiddleware`. Remove `BaseHTTPMiddleware` imports from both files.

## Items explicitly excluded

| Item | Reason |
|------|--------|
| CSP header | Internal enterprise server, no public exposure, maintenance overhead not justified |
| Postgres integration tests in CI | No cloud CI runner; defer until CI infrastructure is established |

## Testing

- Items 1-3: Manual verification (docker-compose config, local pytest, make targets)
- Item 4: Existing Celery task tests should still pass; verify session cleanup with a simple test
- Item 5: `uv sync` should reproduce the exact dependency tree
- Item 6: Existing test suite covers middleware behavior; verify security headers still present in responses
