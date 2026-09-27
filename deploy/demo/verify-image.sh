#!/usr/bin/env bash
# Copyright 2026 Suruch Chakrapeesirisuk
# SPDX-License-Identifier: Apache-2.0

#
# Builds the public demo's image as Render builds it, boots it against an
# empty Postgres, and checks what no other test runs (CW-031): the entrypoint's
# guard and migration step inside the pruned image, the first seed, the console
# served beside the API, and the one-click sign-in.
#
# Both gaps this was written after would have been caught here and nowhere
# else: the pruned image had no `dotenv` for prisma.config.ts, so it could not
# migrate, and no `assets/`, so the API could not boot.
#
# Usage:
#   DATABASE_URL=postgresql://user:pass@localhost:5432/empty_db deploy/demo/verify-image.sh
#       Build the image, run it, assert, tear down. The database must be empty:
#       the demo refuses one it did not create.
#   CWORK_DEMO_BASE_URL=http://127.0.0.1:3000 deploy/demo/verify-image.sh
#       Assert against a demo that is already running.
set -euo pipefail

readonly PORT="${CWORK_DEMO_PORT:-3900}"
readonly IMAGE="cwork-demo:verify"
readonly CONTAINER="cwork-demo-verify"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

started_container=0
passed=0
cleanup() {
  if [ "$started_container" = 1 ]; then
    if [ "$passed" != 1 ]; then
      echo "--- container log (last 80 lines)"
      docker logs "$CONTAINER" 2>&1 | tail -80 || true
    fi
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [ -n "${CWORK_DEMO_BASE_URL:-}" ]; then
  base="$CWORK_DEMO_BASE_URL"
  echo "Asserting against $base (already running)"
else
  : "${DATABASE_URL:?set DATABASE_URL to an empty Postgres database}"
  docker build -f "$here/deploy/demo/Dockerfile" -t "$IMAGE" "$here"
  base="http://127.0.0.1:$PORT"
  # Host networking, so the container reaches the database the way the host does.
  docker run -d --name "$CONTAINER" --network host \
    -e DEMO_MODE=true \
    -e PORT="$PORT" \
    -e DATABASE_URL \
    -e CORS_ORIGINS="$base" \
    -e JWT_ACCESS_SECRET="$(openssl rand -base64 48)" \
    -e JWT_REFRESH_SECRET="$(openssl rand -base64 48)" \
    -e FIELD_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
    "$IMAGE" >/dev/null
  started_container=1
fi

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

# Migrations, boot and the first seed, on a runner's full CPU: well under the
# three minutes allowed here.
ready=0
for _ in $(seq 1 180); do
  if curl -fsS "$base/api/v1/demo" 2>/dev/null | grep -q '"resetting":false'; then
    ready=1
    break
  fi
  sleep 1
done
[ "$ready" = 1 ] || fail "the demo never finished its first seed"
echo "ok    migrated, booted and seeded itself"

headers="$(curl -fsS -D - -o /dev/null "$base/leave")"
grep -qi "^content-security-policy: default-src 'self'" <<<"$headers" ||
  fail "a console deep link came back without the console's CSP"
echo "ok    serves the console, with its security headers, at a deep link"

session="$(curl -fsS -X POST "$base/api/v1/demo/sign-in" \
  -H 'content-type: application/json' -d '{"as":"manager"}')"
token="$(node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).accessToken' <<<"$session")"
curl -fsS "$base/api/v1/auth/me" -H "authorization: Bearer $token" |
  grep -q '"email":"eng.manager@cwork.example"' || fail "the one-click session does not work"
echo "ok    signs the manager in with one click"

status="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$base/api/v1/auth/login" \
  -H 'content-type: application/json' -d '{"email":"hr.manager@cwork.example","password":"a guess"}')"
[ "$status" = 403 ] || fail "password sign-in answered $status, not 403"
echo "ok    refuses password sign-in"

passed=1
echo "The demo image builds, migrates, seeds itself, serves the console and signs in with one click."
