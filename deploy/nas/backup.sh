#!/bin/sh
# Copyright 2026 Suruch Chakrapeesirisuk
# SPDX-License-Identifier: Apache-2.0

# Backs up Cwork's database (and uploaded files) to a folder on ANOTHER disk
# (CW-062). Run by hand, by the NAS's Task Scheduler every night, and by
# update.sh before every update.
#
#   ./backup.sh [--dir DIR] [--tag NAME] [--allow-same-disk]
#
# Writes, into DIR (default: CWORK_BACKUP_DIR from .env):
#   cwork-YYYYMMDD-HHMMSS[-tag].sql.gz           the database
#   cwork-YYYYMMDD-HHMMSS[-tag].uploads.tar.gz   uploaded files (if there are any)
#   cwork-YYYYMMDD-HHMMSS[-tag].sha256           checksums of the two
# and removes backups older than CWORK_BACKUP_KEEP_DAYS (default 14).
#
# Path C: on the NAS (mode db) it saves the database; on the office PC (mode app)
# it saves only the uploaded files, which live on the PC. Run it on both.
#
# It never writes the encryption key: the backup alone must not be enough to
# read the staff data. Keep the key apart (./show-key.sh, password manager).
# It refuses to write to the same disk as Docker's data: a backup that dies with
# the disk it protects is not a backup.

. "$(dirname "$0")/lib.sh"

DIR="" TAG="" ALLOW_SAME=0
while [ $# -gt 0 ]; do
  case $1 in
    --dir) DIR=$2; shift 2 ;;
    --tag) TAG=$2; shift 2 ;;
    --allow-same-disk) ALLOW_SAME=1; shift ;;
    *) die "unknown option $1" ;;
  esac
done

need_root
need_docker
load_env
DIR=${DIR:-${CWORK_BACKUP_DIR:-}}
[ -n "$DIR" ] || die "no backup folder. Pass --dir, or set CWORK_BACKUP_DIR in .env."
case $TAG in ""|*[!A-Za-z0-9-]*) [ -z "$TAG" ] || die "--tag may only contain letters, digits and dashes" ;; esac

# Only the last folder is created: if the drive is not plugged in, its mount
# point is missing and a deeper mkdir would silently fill the NAS's system disk.
[ -d "$(dirname "$DIR")" ] || die "$(dirname "$DIR") does not exist. Is the backup drive plugged in and mounted?"
mkdir -p "$DIR" || die "cannot create $DIR"
[ -w "$DIR" ] || die "$DIR is not writable"

dev_backup=$(device_of "$DIR")
dev_docker=$(device_of "$(docker_root)")
if [ -n "$dev_backup" ] && [ "$dev_backup" = "$dev_docker" ]; then
  if [ "$ALLOW_SAME" = 1 ]; then
    warn "$DIR is on the same disk as Cwork's data. Allowed because you asked; a disk failure would lose both."
  else
    die "$DIR is on the same disk as Cwork's data ($dev_backup). Use a USB drive, another volume or another machine's share. (--allow-same-disk overrides this for a test.)"
  fi
fi

MODE=${CWORK_MODE:-full}
PROJECT=${COMPOSE_PROJECT_NAME:-cwork}
if [ "$MODE" != app ]; then
  pgcid=$(dc ps -q postgres 2>/dev/null | head -n 1)
  [ -n "$pgcid" ] || die "the database container is not running (./status.sh)"
fi

name="cwork-$(stamp)${TAG:+-$TAG}"
base="$DIR/$name"
trap 'rm -f "$base".*.partial' EXIT INT TERM

if [ "$MODE" != app ]; then
  note "dumping the database"
  docker exec "$pgcid" pg_dump -U "${POSTGRES_USER:-cwork}" -d "${POSTGRES_DB:-cwork}" --no-owner --no-privileges \
    | gzip -c > "$base.sql.gz.partial" || die "pg_dump failed"
  # pg_dump's last line says it finished; a cut-off dump lacks it. (A pipe hides
  # pg_dump's own exit status in plain sh, so this is the check.)
  gunzip -c "$base.sql.gz.partial" | tail -n 10 | grep -q 'PostgreSQL database dump complete' \
    || die "the dump is incomplete (disk full? database stopped?). Nothing was kept."
  mv "$base.sql.gz.partial" "$base.sql.gz"
  ok "database: $(du -h "$base.sql.gz" | awk '{print $1}')"
fi

if [ "$MODE" != db ] && docker volume inspect "${PROJECT}_api-uploads" >/dev/null 2>&1; then
  note "copying uploaded files"
  # Any image with tar will do: the one the API runs from is on this machine.
  tarimage=$(docker inspect -f '{{.Config.Image}}' "$(dc ps -q api 2>/dev/null | head -n 1)" 2>/dev/null)
  [ -n "$tarimage" ] || tarimage=$(docker inspect -f '{{.Config.Image}}' "$pgcid")
  docker run --rm -v "${PROJECT}_api-uploads":/data:ro --entrypoint tar "$tarimage" czf - -C /data . \
    > "$base.uploads.tar.gz.partial" || die "could not copy uploaded files"
  gunzip -t "$base.uploads.tar.gz.partial" || die "the uploads archive is damaged"
  mv "$base.uploads.tar.gz.partial" "$base.uploads.tar.gz"
  ok "uploads: $(du -h "$base.uploads.tar.gz" | awk '{print $1}')"
fi

made=""
[ -f "$base.sql.gz" ] && made="$name.sql.gz"
[ -f "$base.uploads.tar.gz" ] && made="$made $name.uploads.tar.gz"
[ -n "$made" ] || die "nothing was backed up"
# shellcheck disable=SC2086
( cd "$DIR" && sha256sum $made > "$name.sha256" ) || die "could not write checksums"
trap - EXIT INT TERM

keep=${CWORK_BACKUP_KEEP_DAYS:-14}
find "$DIR" -maxdepth 1 -type f -name 'cwork-*' -mtime +"$keep" -exec rm -f {} + 2>/dev/null
left=$(ls "$DIR"/cwork-*.sha256 2>/dev/null | wc -l | tr -d ' ')
ok "kept $left backups (older than $keep days are removed)"

printf '%s\n' "$base" > "$HERE/.last-backup"
[ -n "$TAG" ] && printf '%s\n' "$base" > "$HERE/.last-$TAG"
[ -f "$base.sql.gz" ] && say "Backup: $base.sql.gz" || say "Backup (uploaded files only): $base.uploads.tar.gz"
