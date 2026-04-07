#!/bin/bash
set -e

# Ensure upload directory exists and is writable.
# Docker named volumes may be created as root on first mount;
# the Dockerfile pre-creates this dir with correct ownership, but
# existing volumes from older images may still be root-owned.
mkdir -p /app/data/uploads 2>/dev/null || true
if [ ! -w /app/data/uploads ]; then
    echo "WARNING: /app/data/uploads is not writable by $(whoami). Uploads will fail." >&2
    echo "Fix: docker-compose exec -u root api chown -R appuser:appuser /app/data/uploads" >&2
fi

echo "Running migrations..."
alembic upgrade head

exec "$@"
