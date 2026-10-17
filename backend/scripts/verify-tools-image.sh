#!/usr/bin/env bash
# Copyright 2026 Suruch Chakrapeesirisuk
# SPDX-License-Identifier: Apache-2.0

#
# Builds the two images docker-compose.yml runs from backend/Dockerfile and checks
# what no other test does (CW-062): that the tools image (the `build` stage, the
# `migrate` service) can run `npm run db:verify` for real against a migrated
# database, and that `psql`, which that needs, did not leak into the runtime image
# the API runs from.
#
# Usage:
#   DATABASE_URL=postgresql://user:pass@localhost:5432/empty_db backend/scripts/verify-tools-image.sh
#       The database must be empty and reachable from the host's network.
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL to an empty, reachable PostgreSQL database}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tools="cwork-tools:verify"
runtime="cwork-api:verify"

docker build --target build -t "$tools" "$here"
docker build --target runtime -t "$runtime" "$here"

run_tools() {
  docker run --rm --network host -e DATABASE_URL="$DATABASE_URL?schema=public" "$tools" "$@"
}

echo "== the tools image applies the migrations"
run_tools npx prisma migrate deploy

echo "== npm run db:verify passes on the migrated database"
run_tools npm run db:verify

echo "== npm run db:verify fails when a hand-written object is missing"
psql_url="${DATABASE_URL%%\?*}"
docker run --rm --network host "$tools" psql "$psql_url" -v ON_ERROR_STOP=1 \
  -c 'DROP INDEX employees_name_trgm_idx'
if run_tools npm run db:verify; then
  echo "db:verify passed with an index missing: it is not checking anything" >&2
  exit 1
fi

echo "== psql is not in the runtime image the API runs from"
if docker run --rm --entrypoint sh "$runtime" -c 'command -v psql' >/dev/null 2>&1; then
  echo "psql leaked into the runtime image" >&2
  exit 1
fi

echo "ok: the tools image runs db:verify; the runtime image has no psql"
