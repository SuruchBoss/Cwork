# Copyright 2026 Suruch Chakrapeesirisuk
# SPDX-License-Identifier: Apache-2.0

# Shared by the scripts in this folder (CW-062). Plain POSIX sh: a Synology's
# shell is not bash, and nothing here may need anything a NAS does not have.
# Sourced, never run.

HERE=$(cd "$(dirname "$0")" && pwd)
ENV_FILE="$HERE/.env"

say()  { printf '%s\n' "$*"; }
ok()   { printf '  [ ok ] %s\n' "$*"; }
note() { printf '  [ .. ] %s\n' "$*"; }
warn() { printf '  [WARN] %s\n' "$*"; }
bad()  { printf '  [FAIL] %s\n' "$*"; }
die()  { printf '\nStopped: %s\n' "$*" >&2; exit 1; }

# Reads `.env` into the environment. Values are written without spaces or
# quotes by install.sh, so sourcing it is safe.
load_env() {
  [ -f "$ENV_FILE" ] || die ".env is missing. Run ./install.sh first."
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
}

# docker compose for this stack, with the profiles this machine's mode needs.
# CWORK_MODE: full (the whole stack), db (PostgreSQL only, path C on the NAS),
# app (API and console, path C on the PC).
dc() {
  case "${CWORK_MODE:-full}" in
    full) profiles="--profile db --profile app" ; extra="" ;;
    db)   profiles="--profile db" ; extra="-f $HERE/docker-compose.lan-db.yml" ;;
    app)  profiles="--profile app" ; extra="" ;;
    *)    die "CWORK_MODE in .env must be full, db or app" ;;
  esac
  # shellcheck disable=SC2086
  docker compose --project-directory "$HERE" -f "$HERE/docker-compose.yml" $extra \
    --env-file "$ENV_FILE" $profiles "$@"
}

need_root() {
  [ "$(id -u)" = 0 ] || die "run this as root (on a Synology: sudo -i first). Docker on a NAS is root's."
}

need_docker() {
  command -v docker >/dev/null 2>&1 || die "Docker is not installed. Run ./check.sh: it says what to install."
  docker info >/dev/null 2>&1 || die "Docker is installed but not running, or you are not root."
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is missing. Container Manager includes it; update the package."
}

docker_root() { docker info --format '{{.DockerRootDir}}' 2>/dev/null; }

# Megabytes free on the filesystem holding a path (the path may not exist yet:
# the nearest parent that does is used).
free_mb() {
  d=$1
  while [ ! -e "$d" ] && [ "$d" != "/" ]; do d=$(dirname "$d"); done
  df -Pm "$d" 2>/dev/null | awk 'NR==2 {print $4}'
}

# The filesystem a path is on (the name `df` shows), to tell whether two paths
# share a disk. `stat` device numbers are not used: on a Synology each shared
# folder is its own btrfs subvolume with its own number, though all of them sit
# on the same volume and fail together.
device_of() {
  d=$1
  while [ ! -e "$d" ] && [ "$d" != "/" ]; do d=$(dirname "$d"); done
  df -P "$d" 2>/dev/null | awk 'NR==2 {print $1}'
}

# 0 when something already listens on a TCP port on this machine.
port_in_use() {
  p=$1
  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]$p\$"
  elif command -v netstat >/dev/null 2>&1; then
    netstat -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]$p\$"
  else
    return 1
  fi
}

# The address other machines on the LAN reach this one by.
lan_ip() {
  if command -v hostname >/dev/null 2>&1 && hostname -I >/dev/null 2>&1; then
    hostname -I | awk '{print $1}'
  elif command -v ip >/dev/null 2>&1; then
    ip route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i <= NF; i++) if ($i == "src") print $(i + 1)}'
  fi
}

rand_hex()    { od -An -N"$1" -tx1 /dev/urandom | tr -d ' \n'; }
rand_base64() { head -c "$1" /dev/urandom | base64 | tr -d '\n'; }

# Waits for a service in this stack to report healthy.
wait_healthy() {
  svc=$1; limit=${2:-180}; waited=0
  while [ "$waited" -lt "$limit" ]; do
    cid=$(dc ps -q "$svc" 2>/dev/null | head -n 1)
    if [ -n "$cid" ]; then
      st=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null)
      [ "$st" = "healthy" ] && return 0
      [ "$st" = "running" ] && [ "$svc" = "proxy" ] && return 0
    fi
    sleep 3; waited=$((waited + 3))
  done
  return 1
}

stamp() { date +%Y%m%d-%H%M%S; }

# Checks that the hand-written database objects (indexes, constraints, the
# append-only triggers) are in place. `npm run db:verify` needs psql inside the
# tools image, which that image does not have, so the same SQL file (copied into
# the image) is piped into psql in the PostgreSQL container instead.
verify_db() {
  [ "${CWORK_MODE:-full}" = full ] || return 0
  cid=$(dc ps -q postgres 2>/dev/null | head -n 1)
  [ -n "$cid" ] || return 1
  sql=$(dc run --rm -T --entrypoint cat migrate /app/scripts/verify-db-objects.sql 2>/dev/null)
  [ -n "$sql" ] || return 1   # an empty file would "pass"; it must not
  printf '%s\n' "$sql" \
    | docker exec -i "$cid" psql -v ON_ERROR_STOP=1 -q -U "${POSTGRES_USER:-cwork}" -d "${POSTGRES_DB:-cwork}" >/dev/null 2>&1
}

# Does the encryption key in .env open the encrypted values in a database? A
# wrong key is the one mistake a restore cannot undo, so restore.sh asks this of
# a scratch copy BEFORE it touches the real database. Prints "n:bad" (how many
# encrypted values were tried, how many did not open). Succeeds when none failed,
# including when there is nothing encrypted yet.
key_opens_db() {
  cid=$1; db=$2
  vals=$(docker exec -i "$cid" psql -U "${POSTGRES_USER:-cwork}" -d "$db" -At -c "
    SELECT v FROM (
      SELECT \"mfaSecretEnc\" AS v FROM users
      UNION ALL SELECT \"nationalIdEnc\" FROM employees
      UNION ALL SELECT \"taxIdEnc\" FROM employees
      UNION ALL SELECT \"accountNoEnc\" FROM employee_bank_accounts
    ) t WHERE v LIKE 'v1:%' LIMIT 20" 2>/dev/null)
  [ -n "$vals" ] || { echo "0:0"; return 0; }
  res=$(printf '%s\n' "$vals" | dc run --rm -T --entrypoint node migrate -e '
    const c = require("crypto");
    const key = Buffer.from(process.env.FIELD_ENCRYPTION_KEY, "base64");
    let n = 0, bad = 0;
    require("fs").readFileSync(0, "utf8").split("\n").filter(Boolean).forEach((v) => {
      n++;
      try {
        const [, iv, tag, data] = v.split(":");
        const d = c.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
        d.setAuthTag(Buffer.from(tag, "base64"));
        d.update(Buffer.from(data, "base64"));
        d.final();
      } catch (e) { bad++; }
    });
    console.log(n + ":" + bad);
    process.exit(bad ? 1 : 0);
  ' 2>/dev/null | tail -n 1)
  echo "$res"
  case $res in *:0) return 0 ;; *) return 1 ;; esac
}
