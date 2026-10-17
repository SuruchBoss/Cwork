#!/bin/sh
# Prints FIELD_ENCRYPTION_KEY, once, on request. National IDs, bank accounts and
# two-factor secrets are encrypted with it: lose it and they are gone for good.
# Keep it in a password manager, never in the same place as the backups.
. "$(dirname "$0")/lib.sh"
need_root; load_env
say "FIELD_ENCRYPTION_KEY=$FIELD_ENCRYPTION_KEY"
say ""
say "Copy it somewhere safe that is NOT the backup folder, then clear this screen."
