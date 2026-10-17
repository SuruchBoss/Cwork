#!/bin/sh
# Copyright 2026 Suruch Chakrapeesirisuk
# SPDX-License-Identifier: Apache-2.0

# Moves the console to a new address, for when the NAS gets a new IP address or
# name (#97). Editing .env alone changes nothing: the proxy and the API keep the
# old address until they are recreated, and until then a browser at the new
# address fails the certificate check. This edits the two lines and recreates
# them.
#
#   ./change-address.sh NEW_ADDRESS [--port 8443] [--yes]
#
# Cwork's own certificate authority does not change with the address, so PCs
# that already trust it need nothing. Only an uninstall and a fresh install
# make a new authority.
. "$(dirname "$0")/lib.sh"

NEW="" PORT="" ASSUME_YES=0
while [ $# -gt 0 ]; do
  case $1 in
    --port) PORT=$2; shift 2 ;;
    --yes) ASSUME_YES=1; shift ;;
    -*) die "unknown option $1" ;;
    *) [ -z "$NEW" ] || die "give one address only"; NEW=$1; shift ;;
  esac
done
[ -n "$NEW" ] || die "usage: ./change-address.sh NEW_ADDRESS [--port 8443] [--yes]"
case $NEW in *[!A-Za-z0-9.-]*|"") die "the address must be an IP address or a name (letters, digits, dots, dashes), without https:// or a port" ;; esac

need_root; need_docker; load_env
[ "${CWORK_MODE:-full}" = db ] && die "this machine only holds the database (path C); change the address on the PC that runs the console."
OLD_HOST=${CWORK_HOST:-}
OLD_URL=${PUBLIC_WEB_URL:-}
[ -n "$PORT" ] || PORT=$(printf '%s' "$OLD_URL" | sed -n 's#^https://[^:/]*:\([0-9][0-9]*\).*#\1#p')
[ -n "$PORT" ] || PORT=8443
case $PORT in *[!0-9]*) die "the port must be a number" ;; esac
NEW_URL="https://$NEW:$PORT"

if [ "$NEW" = "$OLD_HOST" ] && [ "$NEW_URL" = "$OLD_URL" ]; then
  ok "the console is already at $NEW_URL; nothing to change"
  exit 0
fi

say "The console moves from $OLD_URL to $NEW_URL."
if [ "$ASSUME_YES" != 1 ]; then
  printf 'Is %s this machine'"'"'s address on the office network? [y/N] ' "$NEW"
  read -r answer
  case $answer in y|Y|yes) ;; *) die "nothing changed" ;; esac
fi

tmp="$ENV_FILE.new"
sed -e "s#^CWORK_HOST=.*#CWORK_HOST=$NEW#" -e "s#^PUBLIC_WEB_URL=.*#PUBLIC_WEB_URL=$NEW_URL#" "$ENV_FILE" > "$tmp" || die "could not write the new .env"
chmod 600 "$tmp"
grep -q "^CWORK_HOST=$NEW\$" "$tmp" && grep -q "^PUBLIC_WEB_URL=$NEW_URL\$" "$tmp" || { rm -f "$tmp"; die ".env has no CWORK_HOST or PUBLIC_WEB_URL line to change. Nothing was changed."; }
mv "$tmp" "$ENV_FILE"
ok ".env updated"

load_env
say "Restarting the proxy and the API with the new address (the data is not touched)..."
dc up -d --force-recreate api proxy || die "could not restart. The address is saved in .env; run: docker compose up -d"
wait_healthy api 240 || die "the API did not become healthy. See: docker compose logs api"
ok "the console is at $NEW_URL"
say ""
say "Office PCs that already trust Cwork's certificate need nothing: the certificate authority is the same."
say "Tell staff the new address. A browser still showing the old one will not reach it."
