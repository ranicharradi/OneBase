#!/bin/bash
set -e

echo "Running migrations..."
alembic upgrade head

exec "$@"
