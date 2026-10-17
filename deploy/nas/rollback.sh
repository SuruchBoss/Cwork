#!/bin/sh
# Returns to the version and the data from just before the last update.
#
#   ./rollback.sh [--yes]
#
# Puts the ":previous" images back and restores the backup update.sh took. What
# staff entered AFTER the update is not in that backup; a safety backup of the
# current state is taken first (tag "before-restore") so it can be recovered.

. "$(dirname "$0")/lib.sh"

ASSUME_YES=0
[ "${1:-}" = "--yes" ] && ASSUME_YES=1

need_root
need_docker
load_env
[ -f "$HERE/.last-pre-update" ] || die "no pre-update backup is recorded; nothing to roll back to."
stem=$(cat "$HERE/.last-pre-update")
[ "${CWORK_MODE:-full}" = app ] || [ -f "$stem.sql.gz" ] || die "the pre-update backup $stem.sql.gz is gone. Choose a backup by hand: ./restore.sh <file>"
cur=${CWORK_VERSION:-local}
prev=$(cat "$HERE/.previous-version" 2>/dev/null || echo "$cur")

say "Rolling back to version $prev with the data from $stem"
if [ "$ASSUME_YES" != 1 ]; then
  printf 'Type ROLLBACK to go on: '; read -r a; [ "$a" = ROLLBACK ] || die "cancelled, nothing changed"
fi

if [ "${CWORK_MODE:-full}" != db ]; then
  for img in api web tools; do
    docker image inspect "cwork/$img:previous" >/dev/null 2>&1 || die "cwork/$img:previous is missing; the old version was not kept"
  done
  # The tag the compose file uses becomes the old image again.
  for img in api web tools; do docker tag "cwork/$img:previous" "cwork/$img:$cur"; done
  if [ "$prev" != "$cur" ]; then
    sed -i "s/^CWORK_VERSION=.*/CWORK_VERSION=$prev/" "$ENV_FILE"
    for img in api web tools; do docker tag "cwork/$img:previous" "cwork/$img:$prev"; done
    CWORK_VERSION=$prev; export CWORK_VERSION
  fi
  ok "old images in place"
fi

if [ "${CWORK_MODE:-full}" = app ]; then
  dc up -d >/dev/null
  say ""
  say "Rolled back the programs on this PC to version $prev."
  say "If the update changed the database, also run ./rollback.sh on the NAS, which restores the database backup taken before the update."
  exit 0
fi
[ "${CWORK_MODE:-full}" = db ] || dc up -d >/dev/null
"$HERE/restore.sh" "$stem.sql.gz" --yes || die "the restore step failed (see above)"
say ""
say "Rolled back. Version $prev, data as of the backup before the update."
