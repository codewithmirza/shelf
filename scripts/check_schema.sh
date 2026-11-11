#!/usr/bin/env bash
# Checks that the Drizzle schema matches the SQL migrations (Gate 4, M-02). Used by CI.
set -euo pipefail
out=$(mktemp -d)
pnpm drizzle-kit generate --dialect sqlite --schema ./src/server/db/schema.ts --out "$out" >/dev/null
python3 scripts/check_schema.py db/migrations "$out"
