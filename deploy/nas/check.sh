#!/bin/sh
# Copyright 2026 Suruch Chakrapeesirisuk
# SPDX-License-Identifier: Apache-2.0

# Looks at this machine and says which way of installing Cwork applies, without
# changing anything (CW-062). Safe to run on the pilot's NAS at any time.
#
#   ./check.sh [--port 8443]
#
# Exit status: 0 path A (go ahead), 2 path B (Container Manager must be installed
# first), 1 something blocks the install.

. "$(dirname "$0")/lib.sh"

PORT=8443
while [ $# -gt 0 ]; do
  case $1 in
    --port) PORT=$2; shift 2 ;;
    *) die "unknown option $1" ;;
  esac
done
[ -f "$ENV_FILE" ] && PORT=$(sed -n 's/^CWORK_HTTPS_PORT=//p' "$ENV_FILE" | head -n 1 | grep . || echo "$PORT")

blocked=0
say "Checking this machine for Cwork."
say ""

# --- who is running this
if [ "$(id -u)" = 0 ]; then ok "running as root"
else bad "not root. On a Synology: sudo -i, then run this again."; blocked=1; fi

# --- the processor
arch=$(uname -m)
case $arch in
  x86_64|amd64) ok "processor: $arch (Cwork's images are built for it)" ;;
  aarch64|arm64) warn "processor: $arch (ARM). The images are multi-architecture but have not been rehearsed on ARM; test before relying on it." ;;
  *) bad "processor: $arch is not one Cwork supports"; blocked=1 ;;
esac

# --- is this a Synology, and which DSM
dsm=""
if [ -r /etc.defaults/VERSION ]; then
  major=$(sed -n 's/^majorversion="\(.*\)"/\1/p' /etc.defaults/VERSION)
  minor=$(sed -n 's/^minorversion="\(.*\)"/\1/p' /etc.defaults/VERSION)
  build=$(sed -n 's/^buildnumber="\(.*\)"/\1/p' /etc.defaults/VERSION)
  model=$(sed -n 's/^unique="synology_\(.*\)"/\1/p' /etc.defaults/VERSION)
  dsm="$major.$minor"
  ok "Synology DSM $dsm (build $build) ${model:+on $model}"
  if [ "$major" -lt 7 ] || { [ "$major" = 7 ] && [ "$minor" -lt 2 ]; }; then
    warn "DSM before 7.2 has the package called Docker, not Container Manager, and an older Compose. Update DSM, or ask before going on."
  fi
else
  note "not a Synology (no /etc.defaults/VERSION): fine for a rehearsal, the DSM steps do not apply"
fi

# --- Docker / Container Manager
have_docker=0
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  have_docker=1
  ok "Docker engine $(docker version --format '{{.Server.Version}}' 2>/dev/null)"
  if docker compose version >/dev/null 2>&1; then ok "$(docker compose version 2>/dev/null | head -n 1)"
  else bad "Docker Compose v2 is missing (update Container Manager)"; blocked=1; fi
elif command -v docker >/dev/null 2>&1; then
  bad "Docker is installed but not answering (not root, or the package is stopped)"; blocked=1
else
  note "Docker / Container Manager is not installed"
fi
if command -v synopkg >/dev/null 2>&1; then
  for pkg in ContainerManager Docker; do
    if synopkg status "$pkg" >/dev/null 2>&1; then note "package $pkg: $(synopkg status "$pkg" 2>/dev/null | tr -d '\n' | cut -c1-80)"; fi
  done
fi

# --- memory
mem_total=$(awk '/^MemTotal:/ {print int($2/1024)}' /proc/meminfo 2>/dev/null)
mem_avail=$(awk '/^MemAvailable:/ {print int($2/1024)}' /proc/meminfo 2>/dev/null)
if [ -n "$mem_total" ]; then
  if [ "${mem_avail:-0}" -lt 1500 ]; then bad "memory: ${mem_avail} MB free of ${mem_total} MB. Cwork needs about 1.5 GB beside what runs now."; blocked=1
  elif [ "${mem_avail:-0}" -lt 3000 ]; then warn "memory: ${mem_avail} MB free of ${mem_total} MB. Enough, but not roomy beside other containers."
  else ok "memory: ${mem_avail} MB free of ${mem_total} MB"; fi
fi

# --- disk
if [ "$have_docker" = 1 ]; then root=$(docker_root)
elif [ -d /volume1 ]; then root=/volume1   # a Synology: Container Manager will keep its data on the first volume
else root=/var/lib/docker; fi
free=$(free_mb "$root")
if [ -n "$free" ]; then
  if [ "$free" -lt 4000 ]; then bad "disk: ${free} MB free where Docker keeps its data ($root). Needs at least 4 GB."; blocked=1
  elif [ "$free" -lt 10000 ]; then warn "disk: ${free} MB free where Docker keeps its data ($root). Enough to start; watch it."
  else ok "disk: ${free} MB free where Docker keeps its data ($root)"; fi
fi

# --- the port
if port_in_use "$PORT"; then
  if [ "$have_docker" = 1 ] && docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null | grep -q "^cwork-proxy.*:$PORT->"; then
    ok "port $PORT is Cwork's own (already installed)"
  else
    bad "port $PORT is already used by something else. Pick another with --port."; blocked=1
  fi
else
  ok "port $PORT is free"
fi

# --- what else runs (so a clash is seen before it happens)
if [ "$have_docker" = 1 ]; then
  others=$(docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null | grep -v '^cwork-' || true)
  if [ -n "$others" ]; then
    note "other containers running here (Cwork will not touch them):"
    printf '%s\n' "$others" | sed 's/^/           /' | cut -c1-110
  fi
fi

# --- reaching the internet (only needed to fetch images and build)
if [ ! -f "$HERE/images.tar.gz" ]; then
  for url in https://registry-1.docker.io/v2/ https://registry.npmjs.org/; do
    if command -v curl >/dev/null 2>&1 && curl -sS -m 10 -o /dev/null "$url" 2>/dev/null; then ok "can reach $url"
    else warn "cannot reach $url. Installing needs it, unless you bring images.tar.gz (see the guide)."; fi
  done
else
  ok "images.tar.gz is here: no internet needed to install"
fi

say ""
if [ "$blocked" = 1 ]; then
  say "RESULT: something above is marked FAIL. Fix it and run this again."
  exit 1
fi
if [ "$have_docker" = 1 ]; then
  say "RESULT: PATH A. Container Manager is there. Next: ./install.sh"
  exit 0
fi
say "RESULT: PATH B. Install Container Manager first (DSM: Package Center, search"
say "        'Container Manager', Install), then run ./check.sh again."
exit 2
