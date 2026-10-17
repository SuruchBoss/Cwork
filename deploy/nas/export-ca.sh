#!/bin/sh
# Copyright 2026 Suruch Chakrapeesirisuk
# SPDX-License-Identifier: Apache-2.0

# Hands over the certificate of Cwork's own authority, so an office PC's browser
# trusts https://<this address>:<port>. Do it once per PC. Nothing secret is in
# the file: it is the public half.
#
#   ./export-ca.sh [DESTINATION_FOLDER]     (default: this folder)
. "$(dirname "$0")/lib.sh"
need_root; need_docker; load_env
dest=${1:-$HERE}
mkdir -p "$dest"
tries=0
until dc cp proxy:/data/caddy/pki/authorities/local/root.crt "$dest/cwork-office-ca.crt" 2>/dev/null; do
  tries=$((tries + 1)); [ "$tries" -ge 10 ] && die "the certificate is not made yet. Open the console once, then run this again."
  sleep 3
done
chmod 644 "$dest/cwork-office-ca.crt"
say "Wrote $dest/cwork-office-ca.crt"
if command -v openssl >/dev/null 2>&1; then
  say "Its fingerprint, to compare on the PC before trusting it:"
  openssl x509 -in "$dest/cwork-office-ca.crt" -noout -fingerprint -sha256
fi
say ""
say "On each office PC (Windows): double-click the file, Install Certificate, Local Machine,"
say "'Place all certificates in the following store', Trusted Root Certification Authorities."
say "Then restart the browser. The guide has the same steps with pictures' worth of detail."
