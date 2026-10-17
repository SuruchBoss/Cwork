#!/bin/sh
# Copyright 2026 Suruch Chakrapeesirisuk
# SPDX-License-Identifier: Apache-2.0

# Makes the first administrator, once. With --web it prints a one-hour token to
# finish in the browser instead (nicer for typing a Thai organisation name).
. "$(dirname "$0")/lib.sh"
need_root; need_docker; load_env
[ "${CWORK_MODE:-full}" = db ] && die "the first administrator is made on the machine that runs the API, not the database machine"
if [ "$1" = "--web" ]; then
  dc run --rm migrate npm run db:init -- --web
else
  dc run --rm migrate npm run db:init
fi
