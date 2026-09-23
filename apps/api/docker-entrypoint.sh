#!/bin/sh
# Applies migrations before the API starts, then optionally seeds.
# Both are idempotent, so this is safe on every deploy and every restart.
set -e

echo "[entrypoint] applying migrations…"
node dist/db/migrate.js

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "[entrypoint] seeding…"
  node dist/db/seed.js
fi

echo "[entrypoint] starting API"
exec "$@"
