# Contributing to OneBase

## Prerequisites

- Python 3.12
- Node.js 22
- Docker (for Postgres + Redis)

## Local Setup

See [CLAUDE.md](./CLAUDE.md) for detailed setup instructions. Quick start:

```bash
# Start databases
docker-compose up -d postgres redis

# Backend (from backend/)
python3 -m venv .venv
source .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements-dev.txt
ENV_PROFILE=dev alembic upgrade head
ENV_PROFILE=dev uvicorn app.main:app --reload

# Frontend (from frontend/)
npm install
npm run dev
```

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
cd backend && source .venv/bin/activate
python3 -m pytest                    # all tests
python3 -m pytest tests/test_auth.py # single file

# Frontend
cd frontend
npm run test          # all tests (single run)
npm run test:watch    # watch mode
npm run test:coverage # with coverage
```

## Code Style

- **Backend:** [Ruff](https://docs.astral.sh/ruff/) for linting and formatting
  ```bash
  cd backend && ruff check app/ && ruff format --check app/
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
