.PHONY: dev test lint build clean test-ui

# Backend (venv at project root)
PYTHON = .venv/bin/python

test:
	cd backend && ../$(PYTHON) -m pytest

lint:
	cd backend && ../$(PYTHON) -m ruff check app/ && ../$(PYTHON) -m ruff format --check app/

lint-fix:
	cd backend && ../$(PYTHON) -m ruff check app/ --fix && ../$(PYTHON) -m ruff format app/

dev-api:
	cd backend && ENV_PROFILE=dev ../$(PYTHON) -m uvicorn app.main:app --reload

dev-worker:
	cd backend && ENV_PROFILE=dev ../.venv/bin/celery -A app.tasks.celery_app worker --loglevel=info --concurrency=2

# Frontend
dev-ui:
	cd frontend && npm run dev

build-ui:
	cd frontend && npm run build

lint-ui:
	cd frontend && npm run lint

test-ui:
	cd frontend && npm run test

# Docker
up:
	docker-compose up -d

down:
	docker-compose down

logs:
	docker-compose logs -f api worker
