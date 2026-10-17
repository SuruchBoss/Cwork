#!/bin/sh
# Removes Cwork from this machine, INCLUDING its database and uploaded files
# (CW-062). For starting over, or taking Cwork off a machine. Backups in the
# backup folder are not touched.
#
#   ./uninstall.sh

. "$(dirname "$0")/lib.sh"

need_root
need_docker
[ -f "$ENV_FILE" ] || note "no .env here; removing whatever Cwork containers and volumes exist"
[ -f "$ENV_FILE" ] && load_env
say "This ERASES Cwork's database and uploaded files from this machine."
say "Backups in the backup folder stay. The encryption key in .env goes with .env: save it first (./show-key.sh) if you may restore later."
printf 'Type ERASE to go on: '
read -r a
[ "$a" = ERASE ] || die "cancelled, nothing changed"
if [ -f "$ENV_FILE" ]; then
  dc down --volumes --remove-orphans || die "could not stop the containers"
else
  docker compose --project-directory "$HERE" -f "$HERE/docker-compose.yml" down --volumes --remove-orphans 2>/dev/null || true
fi
rm -f "$ENV_FILE" "$HERE/.last-backup" "$HERE/.last-pre-update" "$HERE/.previous-version" "$HERE/cwork-office-ca.crt"
ok "Cwork removed from this machine"
