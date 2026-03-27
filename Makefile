.PHONY: dev test lint build clean

# Backend
test:
	cd backend && source .venv/bin/activate && pytest

lint:
	cd backend && source .venv/bin/activate && ruff check app/ && ruff format --check app/

lint-fix:
	cd backend && source .venv/bin/activate && ruff check app/ --fix && ruff format app/

dev-api:
	cd backend && source .venv/bin/activate && ENV_PROFILE=dev uvicorn app.main:app --reload

dev-worker:
	cd backend && source .venv/bin/activate && ENV_PROFILE=dev celery -A app.tasks.celery_app worker --loglevel=info --concurrency=2

# Frontend
dev-ui:
	cd frontend && npm run dev

build-ui:
	cd frontend && npm run build

lint-ui:
	cd frontend && npm run lint

# Docker
up:
	docker-compose up -d

down:
	docker-compose down

logs:
	docker-compose logs -f api worker
