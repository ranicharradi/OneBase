SHELL := /bin/bash
.DEFAULT_GOAL := help

UV ?= uv
BACKEND_DIR := backend
DOCKER_COMPOSE ?= docker-compose
COMPOSE_DEV_FILES := -f docker-compose.yml -f docker-compose.dev.yml
PYTEST_ARGS ?=
TEST ?=
MSG ?=
REV ?= -1

.PHONY: help install install-backend install-ui venv backend-sync \
	dev db-up dev-api dev-worker dev-ui health \
	test test-backend test-fast test-slow test-backend-serial test-backend-one \
	test-ui test-ui-watch test-ui-coverage \
	lint lint-backend lint-ui lint-fix lint-backend-fix format format-backend \
	build build-ui preview-ui \
	db-migrate db-current db-history db-revision db-downgrade \
	up up-dev down down-dev logs logs-api logs-worker ps clean

help: ## Show available targets
	@awk 'BEGIN {FS = ":.*##"; printf "Usage: make <target>\n\nTargets:\n"} /^[a-zA-Z0-9_.-]+:.*##/ {printf "  %-22s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# Setup
venv: backend-sync ## Create/update the backend uv virtual environment

install: install-backend install-ui ## Install backend and frontend dependencies

install-backend: backend-sync ## Install backend dependencies into backend/.venv

backend-sync: ## Sync backend dependencies from uv.lock into backend/.venv
	cd $(BACKEND_DIR) && $(UV) sync --locked

install-ui: ## Install frontend dependencies
	cd frontend && npm install

# Local development
dev: db-up ## Start local dependencies and print app server commands
	@printf "Run these in separate terminals:\\n  make dev-api\\n  make dev-worker\\n  make dev-ui\\n"

db-up: ## Start only Postgres and Redis with dev ports exposed
	$(DOCKER_COMPOSE) $(COMPOSE_DEV_FILES) up -d postgres redis

dev-api: ## Start the FastAPI development server on :8000
	cd $(BACKEND_DIR) && $(UV) run uvicorn app.main:app --reload

dev-worker: ## Start the Celery worker
	cd $(BACKEND_DIR) && $(UV) run celery -A app.tasks.celery_app worker --loglevel=info --concurrency=2

dev-ui: ## Start the Vite development server on :5173
	cd frontend && npm run dev

health: ## Check the API health endpoint
	curl -fsS http://localhost:8000/health

# Tests
test: test-backend test-ui ## Run backend and frontend tests

test-backend: ## Run backend tests; pass extra args with PYTEST_ARGS='...'
	cd $(BACKEND_DIR) && $(UV) run pytest $(PYTEST_ARGS)

test-fast: ## Run backend tests excluding slow ML/embedding tests
	cd $(BACKEND_DIR) && $(UV) run pytest -m "not slow" $(PYTEST_ARGS)

test-slow: ## Run only slow backend ML/embedding tests
	cd $(BACKEND_DIR) && $(UV) run pytest -m slow $(PYTEST_ARGS)

test-backend-serial: ## Run backend tests serially, useful with TEST_DATABASE_URL=postgresql://...
	cd $(BACKEND_DIR) && $(UV) run pytest -n 0 $(PYTEST_ARGS)

test-backend-one: ## Run one backend test path, e.g. make test-backend-one TEST=tests/test_auth.py::test_login_success
	@test -n "$(TEST)" || (echo "Usage: make test-backend-one TEST=tests/test_auth.py::test_login_success" >&2; exit 1)
	cd $(BACKEND_DIR) && $(UV) run pytest $(TEST) $(PYTEST_ARGS)

test-ui: ## Run frontend tests once
	cd frontend && npm run test

test-ui-watch: ## Run frontend tests in watch mode
	cd frontend && npm run test:watch

test-ui-coverage: ## Run frontend tests with coverage
	cd frontend && npm run test:coverage

# Linting and formatting
lint: lint-backend lint-ui ## Run backend and frontend linters

lint-backend: ## Check backend lint and formatting
	cd $(BACKEND_DIR) && $(UV) run ruff check . && $(UV) run ruff format --check .

lint-ui: ## Run frontend ESLint
	cd frontend && npm run lint

lint-fix: lint-backend-fix lint-ui ## Auto-fix backend lint/format issues, then run frontend lint

lint-backend-fix: ## Auto-fix backend lint and formatting issues
	cd $(BACKEND_DIR) && $(UV) run ruff check . --fix && $(UV) run ruff format .

format: format-backend ## Format backend code

format-backend: ## Format backend Python code
	cd $(BACKEND_DIR) && $(UV) run ruff format .

# Builds
build: build-ui ## Build deployable frontend assets

build-ui: ## Build the frontend
	cd frontend && npm run build

preview-ui: ## Preview the built frontend
	cd frontend && npm run preview

# Database migrations
db-migrate: ## Apply Alembic migrations
	cd $(BACKEND_DIR) && $(UV) run alembic upgrade head

db-current: ## Show current Alembic revision
	cd $(BACKEND_DIR) && $(UV) run alembic current

db-history: ## Show Alembic migration history
	cd $(BACKEND_DIR) && $(UV) run alembic history

db-revision: ## Create an Alembic autogenerate revision, e.g. make db-revision MSG='add users'
	@test -n "$(MSG)" || (echo "Usage: make db-revision MSG='description'" >&2; exit 1)
	cd $(BACKEND_DIR) && $(UV) run alembic revision --autogenerate -m "$(MSG)"

db-downgrade: ## Downgrade Alembic by REV, default REV=-1
	cd $(BACKEND_DIR) && $(UV) run alembic downgrade $(REV)

# Docker
up: ## Start the default Docker Compose stack
	$(DOCKER_COMPOSE) up -d

up-dev: ## Start the full development Docker Compose stack with dev ports exposed
	$(DOCKER_COMPOSE) $(COMPOSE_DEV_FILES) up -d

down: ## Stop the default Docker Compose stack
	$(DOCKER_COMPOSE) down

down-dev: ## Stop the development Docker Compose stack
	$(DOCKER_COMPOSE) $(COMPOSE_DEV_FILES) down

logs: ## Tail API and worker logs
	$(DOCKER_COMPOSE) logs -f api worker

logs-api: ## Tail API logs
	$(DOCKER_COMPOSE) logs -f api

logs-worker: ## Tail worker logs
	$(DOCKER_COMPOSE) logs -f worker

ps: ## Show Docker Compose service status
	$(DOCKER_COMPOSE) ps

clean: ## Remove local build and test artifacts
	rm -rf .pytest_cache backend/.pytest_cache frontend/dist frontend/coverage frontend/.vite
