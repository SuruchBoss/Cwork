#!/usr/bin/env bash
# Copyright 2026 Suruch Chakrapeesirisuk
# SPDX-License-Identifier: Apache-2.0

#
# Proves the web console serves its security headers — from the image as it
# ships, not a hand-assembled nginx (CW-053).
#
# The bug this guards (a6d2c43): nginx inherits `add_header` into a `location`
# only when that location sets none of its own, so `/assets/` and
# `/index.html`, which each add a Cache-Control, went out with no CSP and no
# X-Frame-Options — and every SPA deep link resolves to `index.html`. Where
# `security-headers.conf` lands matters too: it must be in /etc/nginx/, not
# conf.d/ (which nginx loads as a standalone config and rejects), so this
# builds and runs the real image rather than a config someone assembled here.
#
# Usage:
#   web/scripts/verify-security-headers.sh
#       Build the web image, run it, assert, tear down.
#   CWORK_WEB_BASE_URL=http://127.0.0.1:8080 web/scripts/verify-security-headers.sh
#       Assert against an already-running server (used to check the assertion
#       logic locally against nginx, where Docker is not available).
set -euo pipefail

readonly PORT="${CWORK_WEB_PORT:-8080}"
readonly IMAGE="cwork-web:headers-test"
readonly CONTAINER="cwork-web-headers-test"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

started_container=0
cleanup() {
  if [ "$started_container" = 1 ]; then docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

if [ -n "${CWORK_WEB_BASE_URL:-}" ]; then
  base="$CWORK_WEB_BASE_URL"
  echo "Asserting against $base (external server)"
else
  command -v docker >/dev/null || {
    echo "docker is required (or set CWORK_WEB_BASE_URL to an already-running server)" >&2
    exit 1
  }
  echo "Building the web image…"
  docker build -t "$IMAGE" "$here" >/dev/null
  echo "Starting the container…"
  # `api` must resolve or nginx refuses to start on the /api/ proxy_pass; the
  # test never calls /api/, so pointing it anywhere is fine.
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker run -d --name "$CONTAINER" --add-host api:127.0.0.1 -p "$PORT:80" "$IMAGE" >/dev/null
  started_container=1
  base="http://127.0.0.1:$PORT"
fi

# Wait for the server to answer.
ready=0
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null "$base/"; then ready=1; break; fi
  sleep 1
done
if [ "$ready" != 1 ]; then
  echo "FAIL: the web server did not become ready at $base" >&2
  [ "$started_container" = 1 ] && docker logs "$CONTAINER" 2>&1 | tail -20 >&2 || true
  exit 1
fi

# A real hashed asset, discovered from the served index.html rather than guessed.
asset="$(curl -fsS "$base/" | grep -oE '/assets/[A-Za-z0-9._-]+\.(js|css)' | head -1 || true)"
if [ -z "$asset" ]; then
  echo "FAIL: no hashed /assets/ file referenced by index.html" >&2
  exit 1
fi
echo "Discovered asset: $asset"

failed=0
require() {
  # require <path> <case-insensitive header regex> <label>
  local path="$1" pattern="$2" label="$3" headers
  headers="$(curl -fsS -D - -o /dev/null "$base$path")"
  if grep -iqE "$pattern" <<<"$headers"; then
    echo "  ok   $label on $path"
  else
    echo "  FAIL $label missing on $path" >&2
    echo "$headers" | sed 's/^/       | /' >&2
    failed=1
  fi
}

# Every path the app is actually served on — including a deep link, which
# reaches index.html through try_files — must carry the security headers.
for path in "/" "/index.html" "$asset" "/employees"; do
  require "$path" '^content-security-policy:.*frame-ancestors' 'CSP'
  require "$path" '^x-frame-options:[[:space:]]*DENY' 'X-Frame-Options'
done

# The header the include sits beside: a careless future fix must not drop the
# reason /assets/ has its own block.
require "$asset" '^cache-control:.*(immutable|public)' 'Cache-Control'

if [ "$failed" != 0 ]; then
  echo "Security headers are NOT correctly served." >&2
  exit 1
fi
echo "All security headers are served on every path."
