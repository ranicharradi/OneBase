# Contributing to OneBase

## Prerequisites

- Python 3.12
- uv
- Node.js 22
- Docker (for Postgres + Redis)

## Local Setup

See the [README](./README.md) for detailed setup instructions. Quick start:

```bash
# Start databases
docker-compose up -d postgres redis

# Backend (from backend/)
cd backend
uv sync --locked
uv run alembic upgrade head
uv run uvicorn app.main:app --reload

# Frontend (from frontend/)
cd ../frontend
npm install
npm run dev
```

Local backend dependencies live in `backend/.venv` and are managed by `uv`. The project pins CPU-only PyTorch in `backend/pyproject.toml`, so contributors should not install `torch` manually before syncing.

## Branch Naming

- `feat/description` — new features
- `fix/description` — bug fixes
- `refactor/description` — code restructuring
- `test/description` — test additions/changes
- `docs/description` — documentation only

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add pagination to review queue
fix: resolve 401 redirect loop
refactor: extract signal config to shared utility
test: add Dashboard page tests
docs: update setup instructions
chore: upgrade vitest to v4
```

## Running Tests

```bash
# Backend
cd backend
uv run pytest                    # all tests
uv run pytest tests/test_auth.py # single file
uv run pytest -n auto            # explicit parallel execution

# Frontend
cd frontend
npm run test          # all tests (single run)
npm run test:watch    # watch mode
npm run test:coverage # with coverage
```

## Code Style

- **Backend:** [Ruff](https://docs.astral.sh/ruff/) for linting and formatting
  ```bash
  cd backend && uv run ruff check app/ && uv run ruff format --check app/
  ```
- **Frontend:** [ESLint](https://eslint.org/) with TypeScript and React plugins
  ```bash
  cd frontend && npm run lint
  ```

## Pull Request Guidelines

1. Branch from `master`, target `master`
2. Include a description of what changed and why
3. All CI checks must pass (backend lint/test, frontend lint/build/test)
4. Request review from a maintainer
5. New code should include tests
