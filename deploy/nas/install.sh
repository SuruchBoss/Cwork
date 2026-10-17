#!/bin/sh
# Installs Cwork on this machine (CW-062). Run it once, as root, in this folder.
#
#   ./install.sh [--mode full|db|app] [--host ADDRESS] [--port 8443]
#                [--backup-dir DIR] [--db-host NAS_ADDRESS --db-password PASSWORD]
#                [--field-key KEY]
#
# full  everything on this machine (paths A and B). The usual choice.
# db    only PostgreSQL, for path C: run this on the NAS.
# app   the API and the console, for path C: run this on the office PC, with
#       --db-host and --db-password from the `db` install.
#
# --field-key is for rebuilding a machine from a backup: pass the encryption key
# saved from the old one, so the restored data can be read (see restore.sh).
#
# It refuses to run over an installation that holds data: that is changed with
# update.sh (or erased on purpose with uninstall.sh).

. "$(dirname "$0")/lib.sh"

MODE=full HOST="" PORT=8443 BACKUP_DIR="" DB_HOST="" DB_PASSWORD="" FIELD_KEY="" ASSUME_YES=0
while [ $# -gt 0 ]; do
  case $1 in
    --mode) MODE=$2; shift 2 ;;
    --host) HOST=$2; shift 2 ;;
    --port) PORT=$2; shift 2 ;;
    --backup-dir) BACKUP_DIR=$2; shift 2 ;;
    --db-host) DB_HOST=$2; shift 2 ;;
    --db-password) DB_PASSWORD=$2; shift 2 ;;
    --field-key) FIELD_KEY=$2; shift 2 ;;
    --yes) ASSUME_YES=1; shift ;;
    *) die "unknown option $1" ;;
  esac
done
case $MODE in full|db|app) ;; *) die "--mode must be full, db or app" ;; esac
[ "$MODE" = app ] && { [ -n "$DB_HOST" ] && [ -n "$DB_PASSWORD" ] || die "--mode app needs --db-host and --db-password (from the NAS install)"; }

need_root
need_docker
if [ -f "$ENV_FILE" ]; then
  if docker volume ls -q | grep -Eq '^cwork_(postgres-data|api-uploads)$'; then
    die "this machine is already installed. To change it use ./update.sh. To start over from nothing (this ERASES the data) use ./uninstall.sh first."
  fi
  note "an earlier install stopped before it created any data; starting again with new settings"
  rm -f "$ENV_FILE"
fi

say "== 1. Checking this machine"
"$HERE/check.sh" --port "$PORT" || { st=$?; [ "$st" = 2 ] && die "install Container Manager first (see ./check.sh)"; die "fix what check.sh marked FAIL"; }

if [ -z "$HOST" ]; then
  HOST=$(lan_ip)
  [ -n "$HOST" ] || die "could not tell this machine's address on the office network. Pass it with --host."
  if [ "$ASSUME_YES" != 1 ]; then
    printf '\nThe console will be at https://%s:%s. Is %s this machine'"'"'s address on the office network? [y/N] ' "$HOST" "$PORT" "$HOST"
    read -r answer
    case $answer in y|Y|yes) ;; *) die "run again with --host <the address staff will type>" ;; esac
  fi
fi


say ""
say "== 2. Writing .env (secrets are made here and nowhere else)"
umask 077
{
  echo "# Written by install.sh on $(date '+%Y-%m-%d %H:%M'). Holds secrets: never copy it into a backup folder"
  echo "# or send it anywhere. FIELD_ENCRYPTION_KEY below is the one thing whose loss cannot be undone."
  echo "CWORK_MODE=$MODE"
  [ -f "$HERE/images.version" ] && echo "CWORK_VERSION=$(sed -n 1p "$HERE/images.version")"
  echo "CWORK_HOST=$HOST"
  echo "CWORK_HTTPS_PORT=$PORT"
  echo "PUBLIC_WEB_URL=https://$HOST:$PORT"
  if [ "$MODE" = app ]; then
    echo "POSTGRES_PASSWORD=$DB_PASSWORD"
    echo "DB_HOST=$DB_HOST"
  else
    echo "POSTGRES_PASSWORD=$(rand_hex 24)"
  fi
  if [ "$MODE" = db ]; then
    echo "DB_BIND=$HOST"
    echo "# Unused on the database machine (the API is elsewhere); present because the file is shared."
    echo "JWT_ACCESS_SECRET=unused-on-the-database-machine"
    echo "JWT_REFRESH_SECRET=unused-on-the-database-machine"
    echo "FIELD_ENCRYPTION_KEY=unused-on-the-database-machine"
  else
    echo "JWT_ACCESS_SECRET=$(rand_base64 48)"
    echo "JWT_REFRESH_SECRET=$(rand_base64 48)"
    echo "FIELD_ENCRYPTION_KEY=${FIELD_KEY:-$(rand_base64 32)}"
  fi
  [ -n "$BACKUP_DIR" ] && echo "CWORK_BACKUP_DIR=$BACKUP_DIR"
  echo "CWORK_BACKUP_KEEP_DAYS=14"
} > "$ENV_FILE"
chmod 600 "$ENV_FILE"
ok ".env written (readable by root only)"
load_env

say ""
say "== 3. Getting the images"
if [ -f "$HERE/images.tar.gz" ]; then
  note "loading images.tar.gz (no internet needed)"
  gunzip -c "$HERE/images.tar.gz" | docker load || die "could not load images.tar.gz"
  ok "images loaded"
else
  [ -d "$HERE/../../backend" ] && [ -d "$HERE/../../web" ] || die "the source folders ../../backend and ../../web are missing, and there is no images.tar.gz. Download the whole Cwork folder, or bring images.tar.gz."
  note "building from the source in this folder; the first time takes about ten minutes"
  case $MODE in
    db)  dc pull postgres || die "could not fetch the database image" ;;
    *)   dc build api web migrate || die "the build failed (needs the internet: Docker Hub and npm)" ; dc pull proxy postgres 2>/dev/null || true ;;
  esac
  ok "images ready"
fi

say ""
say "== 4. Starting"
# Database first and migrated before the API starts, so the API never runs
# against an empty database.
case $MODE in
  db)   dc up -d || die "could not start the database. See: docker compose logs"
        wait_healthy postgres 120 || die "the database did not become healthy" ;;
  full) dc up -d postgres || die "could not start the database. See: docker compose logs"
        wait_healthy postgres 120 || die "the database did not become healthy"
        dc run --rm migrate || die "migrations failed"
        dc up -d || die "could not start the containers. See: docker compose logs"
        wait_healthy api 240 || die "the API did not become healthy. See: docker compose logs api" ;;
  app)  dc run --rm migrate || die "migrations failed (can this machine reach $DB_HOST:5432?)"
        dc up -d || die "could not start the containers. See: docker compose logs"
        wait_healthy api 240 || die "the API did not become healthy. See: docker compose logs api" ;;
esac
if [ "$MODE" != db ]; then
  if [ "$MODE" = full ]; then
    verify_db && ok "database objects verified" || warn "the database-objects check did not pass; run ./status.sh and tell the developer"
  else
    note "this PC has no database; the objects are checked on the NAS (./status.sh there)"
  fi
  wait_healthy proxy 60 || die "the HTTPS front door did not start. See: docker compose logs proxy"
fi
ok "Cwork is running"

say ""
say "== Done. What happens next"
if [ "$MODE" = db ]; then
  say "  1. On the office PC, run:  ./install.sh --mode app --host <PC address> --db-host $HOST --db-password <see below>"
  say "  2. The database password is in .env on this machine (POSTGRES_PASSWORD). Give it to the PC's installer, not to anyone else."
  say "  3. In the NAS firewall allow port 5432 from the PC's address only, and from nothing else."
  say "  4. Choose where backups go (a USB drive, not the NAS's own disk): CWORK_BACKUP_DIR=... in .env here."
else
  say "  1. Make the first administrator:   ./first-admin.sh"
  say "  2. Save the encryption key NOW:    ./show-key.sh   (put it in your password manager)"
  say "  3. Let office PCs trust the HTTPS: ./export-ca.sh  (once per PC; the guide shows how)"
  say "  4. Open  https://$HOST:$PORT  on an office PC."
  say "  5. Choose where backups go: a USB drive or another machine's share, NOT the NAS's own disk."
  say "     Put it in .env as CWORK_BACKUP_DIR=..., then run ./backup.sh once to see it work."
fi
