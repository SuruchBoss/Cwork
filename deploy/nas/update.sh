#!/bin/sh
# Updates Cwork to the version in this folder (CW-062). Safe by construction:
# a backup is taken first and the update stops if it cannot be; the images being
# replaced are kept as ":previous" so ./rollback.sh can put them back.
#
#   ./update.sh
#
# Getting the new version here is the user's step, and needs no key or licence:
#   - copy the new Cwork folder's contents over this one (keep .env!), or
#   - put the new images.tar.gz (and images.version) in this folder.
# If images.tar.gz is present it is loaded; otherwise the images are built from
# the source folders beside this one.

. "$(dirname "$0")/lib.sh"

need_root
need_docker
load_env
[ "${CWORK_MODE:-full}" = db ] && die "this is the database-only machine; PostgreSQL is not updated by Cwork's updates. Run update.sh on the PC that runs the console."

say "== 1. Backup first (the update stops if this fails)"
if [ "${CWORK_MODE:-full}" = full ]; then
  "$HERE/backup.sh" --tag pre-update ${CWORK_BACKUP_DIR:+--dir "$CWORK_BACKUP_DIR"} || die "no backup, so no update. Fix the backup first (./backup.sh shows why)."
else
  warn "this PC has no database; back up on the NAS (./backup.sh there) before going on."
  if [ "${ASSUME_YES:-0}" != 1 ]; then printf 'Backed up on the NAS just now? [y/N] '; read -r a; case $a in y|Y|yes) ;; *) die "back up first" ;; esac; fi
fi

say ""
say "== 2. Keeping the current version for rollback"
cur=${CWORK_VERSION:-local}
for img in api web tools; do
  if docker image inspect "cwork/$img:$cur" >/dev/null 2>&1; then
    docker tag "cwork/$img:$cur" "cwork/$img:previous" && ok "cwork/$img:$cur kept as :previous"
  else
    warn "cwork/$img:$cur not found, nothing to keep for $img"
  fi
done
printf '%s\n' "$cur" > "$HERE/.previous-version"

say ""
say "== 3. Getting the new version"
if [ -f "$HERE/images.tar.gz" ]; then
  [ -f "$HERE/images.version" ] && new=$(sed -n 1p "$HERE/images.version") || new=$cur
  if [ -f "$HERE/images.version" ]; then
    barch=$(sed -n 2p "$HERE/images.version")
    case $(uname -m) in x86_64|amd64) here_arch=amd64 ;; aarch64|arm64) here_arch=arm64 ;; *) here_arch=$(uname -m) ;; esac
    [ -z "$barch" ] || [ "$barch" = "$here_arch" ] || die "images.tar.gz is for $barch; this machine is $here_arch"
  fi
  gunzip -c "$HERE/images.tar.gz" | docker load || die "could not load images.tar.gz"
  ok "images loaded (version $new)"
else
  new=${CWORK_VERSION:-local}
  note "building from the source in this folder (about ten minutes)"
  dc build api web migrate || die "the build failed. The old version is still running; nothing was changed."
  ok "images built"
fi
if [ "$new" != "$cur" ]; then
  sed -i "s/^CWORK_VERSION=.*/CWORK_VERSION=$new/" "$ENV_FILE" 2>/dev/null || true
  grep -q '^CWORK_VERSION=' "$ENV_FILE" || echo "CWORK_VERSION=$new" >> "$ENV_FILE"
  CWORK_VERSION=$new; export CWORK_VERSION
fi

say ""
say "== 4. Switching over"
# Stop the console, migrate the database with the new tools, start the new
# version: nobody is working against a half-updated database.
if [ "${CWORK_MODE:-full}" = full ]; then
  dc up -d postgres || die "database did not start. Run ./rollback.sh"
  wait_healthy postgres 120 || die "database not healthy. Run ./rollback.sh"
fi
dc stop api web proxy >/dev/null 2>&1 || true
dc run --rm migrate || die "migrations failed. Run ./rollback.sh (it restores the backup from step 1)."
dc up -d --force-recreate api web || die "could not start the new version. Run ./rollback.sh"
dc up -d || die "could not start the console. Run ./rollback.sh"
wait_healthy api 240 || die "the new version did not become healthy. Run ./rollback.sh"
verify_db && ok "database objects verified" || die "the database-objects check failed. Run ./rollback.sh"
ok "Cwork is now version $new (was $cur)"
say "If anything looks wrong in the next days, ./rollback.sh returns to the backup taken in step 1 (changes made since are not in it)."
