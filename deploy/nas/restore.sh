#!/bin/sh
# Copyright 2026 Suruch Chakrapeesirisuk
# SPDX-License-Identifier: Apache-2.0

# Puts a backup back (CW-062): into this installation, or into a fresh one built
# with install.sh on a new machine.
#
#   ./restore.sh /path/to/cwork-YYYYMMDD-HHMMSS.sql.gz [--yes] [--no-safety-backup]
#
# It REPLACES the database (and uploaded files, when the backup has them) with
# the backup's. Unless told not to, it first takes a backup of what is there now,
# tagged "before-restore", so a wrong choice can be undone.
#
# Rebuilding from nothing: install.sh --field-key <the saved key> on the new
# machine, then this. The key must be the one the data was written with: staff
# ID numbers and bank accounts are encrypted with it, and no other key opens them.

. "$(dirname "$0")/lib.sh"

SQL="" ASSUME_YES=0 SAFETY=1
while [ $# -gt 0 ]; do
  case $1 in
    --yes) ASSUME_YES=1; shift ;;
    --no-safety-backup) SAFETY=0; shift ;;
    -*) die "unknown option $1" ;;
    *) SQL=$1; shift ;;
  esac
done
[ -n "$SQL" ] || die "which backup? ./restore.sh /path/to/cwork-<date>.sql.gz"
[ -f "$SQL" ] || die "$SQL does not exist"
case $SQL in
  *.sql.gz) UPLOADS=${SQL%.sql.gz}.uploads.tar.gz ;;
  *.uploads.tar.gz) UPLOADS=$SQL ;;
  *) die "give the .sql.gz file (or, on the office PC of path C, the .uploads.tar.gz)" ;;
esac
CHECKSUMS=${SQL%.sql.gz}; CHECKSUMS=${CHECKSUMS%.uploads.tar.gz}.sha256

need_root
need_docker
load_env

say "== Checking the backup"
if [ -f "$CHECKSUMS" ]; then
  ( cd "$(dirname "$SQL")" && sha256sum -c "$(basename "$CHECKSUMS")" >/dev/null 2>&1 ) \
    || die "the backup's checksums do not match: the file is damaged. Use another backup."
  ok "checksums match"
else
  warn "no .sha256 file beside it; the file's integrity is not checked"
fi

# Path C, office PC: only the uploaded files live here; the database is on the NAS.
if [ "${CWORK_MODE:-full}" = app ]; then
  case $SQL in *.uploads.tar.gz) ;; *) die "this is the office PC of path C: it holds only uploaded files. Restore the database on the NAS (./restore.sh there); here give the .uploads.tar.gz." ;; esac
  gunzip -t "$UPLOADS" || die "the uploads archive is damaged"
  if [ "$ASSUME_YES" != 1 ]; then printf 'This replaces the uploaded files on this PC. Type RESTORE to go on: '; read -r answer; [ "$answer" = RESTORE ] || die "cancelled, nothing changed"; fi
  PROJECT=${COMPOSE_PROJECT_NAME:-cwork}
  dc stop api web proxy >/dev/null 2>&1 || true
  tarimage=$(docker inspect -f '{{.Config.Image}}' "$(dc ps -aq api 2>/dev/null | head -n 1)" 2>/dev/null)
  [ -n "$tarimage" ] || die "cannot find the API image to unpack with"
  docker run --rm -i -v "${PROJECT}_api-uploads":/data --entrypoint sh "$tarimage" \
    -c 'find /data -mindepth 1 -delete && tar xzf - -C /data' < "$UPLOADS" || die "could not restore uploaded files"
  dc up -d >/dev/null
  wait_healthy api 240 || die "the API did not come back. See: docker compose logs api"
  ok "uploaded files restored on this PC"
  exit 0
fi

case $SQL in *.sql.gz) ;; *) die "on the machine with the database, give the .sql.gz file" ;; esac
gunzip -c "$SQL" | tail -n 10 | grep -q 'PostgreSQL database dump complete' || die "the dump is cut off (incomplete). Use another backup."
ok "the dump is complete"
[ -f "$UPLOADS" ] && ok "uploaded files found beside it" || note "no uploaded-files archive for this backup"

if [ "${CWORK_MODE:-full}" = db ]; then
  PGUSER=${POSTGRES_USER:-cwork}; PGDB=${POSTGRES_DB:-cwork}
  pgcid=$(dc ps -q postgres 2>/dev/null | head -n 1)
  [ -n "$pgcid" ] || die "the database container is not running (./status.sh)"
  warn "the encryption key is on the office PC, so it cannot be checked here. After the restore, sign in on the console: if ID numbers or sign-in fail, the PC's key is not the backup's."
else
  # Try the key on a scratch copy first: a wrong key is the one mistake that cannot
  # be undone, so find out before anything real is replaced.
  PGUSER=${POSTGRES_USER:-cwork}; PGDB=${POSTGRES_DB:-cwork}
  pgcid=$(dc ps -q postgres 2>/dev/null | head -n 1)
  [ -n "$pgcid" ] || die "the database container is not running (./status.sh)"
  probe="${PGDB}_keycheck"
  docker exec -i "$pgcid" psql -v ON_ERROR_STOP=1 -U "$PGUSER" -d postgres -c "DROP DATABASE IF EXISTS \"$probe\" WITH (FORCE)" -c "CREATE DATABASE \"$probe\"" >/dev/null 2>&1 || die "could not make the scratch database for the key check"
  gunzip -c "$SQL" | docker exec -i "$pgcid" psql -v ON_ERROR_STOP=1 -q -U "$PGUSER" -d "$probe" >/dev/null 2>&1 || { docker exec -i "$pgcid" psql -U "$PGUSER" -d postgres -c "DROP DATABASE IF EXISTS \"$probe\" WITH (FORCE)" >/dev/null 2>&1; die "the backup would not load into a scratch database (damaged, or from a different PostgreSQL version?). Nothing was changed."; }
  keyres=$(key_opens_db "$pgcid" "$probe"); keystatus=$?
  docker exec -i "$pgcid" psql -U "$PGUSER" -d postgres -c "DROP DATABASE IF EXISTS \"$probe\" WITH (FORCE)" >/dev/null 2>&1
  if [ "$keystatus" != 0 ]; then
    die "the encryption key in .env does not open this backup's data (${keyres%%:*} values tried, ${keyres##*:} would not open). Put the key that was saved from the old machine into .env as FIELD_ENCRYPTION_KEY and run this again. Nothing was changed."
  fi
  case $keyres in 0:0) note "no encrypted values in this backup yet, so the key could not be tested" ;; *) ok "the key in .env opens the backup's encrypted data (${keyres%%:*} values tried)" ;; esac
fi

say ""
say "This replaces everything in Cwork with the backup's contents."
if [ "$ASSUME_YES" != 1 ]; then
  printf 'Type RESTORE to go on: '
  read -r answer
  [ "$answer" = RESTORE ] || die "cancelled, nothing changed"
fi

if [ "$SAFETY" = 1 ]; then
  say ""
  say "== Safety backup of what is there now"
  "$HERE/backup.sh" --tag before-restore ${CWORK_BACKUP_DIR:+--dir "$CWORK_BACKUP_DIR"} || die "could not take the safety backup; nothing changed. (--no-safety-backup skips it.)"
fi

say ""
say "== Restoring"
if [ "${CWORK_MODE:-full}" = full ]; then
  dc stop api web proxy >/dev/null 2>&1 || true
  ok "console stopped"
else
  warn "database-only machine: make sure the API on the office PC is stopped"
fi

psql_admin() { docker exec -i "$pgcid" psql -v ON_ERROR_STOP=1 -U "$PGUSER" -d postgres "$@"; }
psql_admin -c "DROP DATABASE IF EXISTS \"$PGDB\" WITH (FORCE)" >/dev/null || die "could not drop the old database"
psql_admin -c "CREATE DATABASE \"$PGDB\"" >/dev/null || die "could not create the database"
gunzip -c "$SQL" | docker exec -i "$pgcid" psql -v ON_ERROR_STOP=1 -q -U "$PGUSER" -d "$PGDB" >/dev/null \
  || die "the restore failed part-way. The safety backup (tag before-restore) holds the previous state. See: docker logs $pgcid"
ok "database restored"

if [ "${CWORK_MODE:-full}" = full ]; then
  if [ -f "$UPLOADS" ]; then
    pgimage=$(docker inspect -f '{{.Config.Image}}' "$pgcid")
    docker run --rm -i -v cwork_api-uploads:/data --entrypoint sh "$pgimage" \
      -c 'find /data -mindepth 1 -delete && tar xzf - -C /data' < "$UPLOADS" || die "could not restore uploaded files"
    ok "uploaded files restored"
  fi
  # A backup from an older version lacks later migrations: apply them.
  dc run --rm migrate >/dev/null 2>&1 || warn "migrations did not apply cleanly; run ./status.sh"
  dc up -d >/dev/null
  wait_healthy api 240 || die "the API did not come back. See: docker compose logs api (often: the encryption key does not match)"
  wait_healthy proxy 60 || true
  ok "console started"
fi

say ""
say "Restored from $SQL"
say "Check it: sign in, open an employee and a payslip. If the ID numbers show as blanks or errors, the key in .env is not the backup's key."
