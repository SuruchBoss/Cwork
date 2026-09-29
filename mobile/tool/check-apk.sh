#!/usr/bin/env bash
# Copyright 2026 Suruch Chakrapeesirisuk
# SPDX-License-Identifier: Apache-2.0
#
# Checks a built APK is one that can be handed to employees (CW-060):
#
#   - it is the Cwork app (com.cwork.app), so it installs over the last one;
#   - HTTPS only: plain-HTTP traffic is refused by Android itself;
#   - no backup: the session and queued punches never leave the phone;
#   - the install page's "open the app" link (cwork://connect) reaches it;
#   - with --release, it is signed with the release key and not a debug key,
#     which the next release could not update.
#
# Usage: tool/check-apk.sh path/to/app-release.apk [--release]
# Needs the Android SDK build tools (ANDROID_HOME), as on GitHub's runners.
set -euo pipefail

apk="${1:?usage: check-apk.sh path/to/app.apk [--release]}"
release="${2:-}"

sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
[ -n "$sdk" ] || { echo "ANDROID_HOME is not set" >&2; exit 2; }
tools="$sdk/build-tools/$(ls "$sdk/build-tools" | sort -V | tail -1)"

failed=0
fail() { echo "FAIL: $*" >&2; failed=1; }
pass() { echo "ok:   $*"; }

badging="$("$tools/aapt2" dump badging "$apk")"
manifest="$("$tools/aapt2" dump xmltree --file AndroidManifest.xml "$apk")"
head -n 1 <<< "$badging"

# A boolean attribute, however this version of aapt2 prints it.
attribute() {
  grep -m 1 -E "android:$1\(0x[0-9a-f]+\)=" <<< "$manifest" |
    sed -E 's/.*=//; s/\(type 0x12\)0x0/false/; s/\(type 0x12\)0xffffffff/true/'
}

grep -q "package: name='com.cwork.app'" <<< "$badging" &&
  pass "application id is com.cwork.app" ||
  fail "application id is not com.cwork.app — it would install beside the app, not over it"

[ "$(attribute usesCleartextTraffic)" = "false" ] &&
  pass "plain-HTTP traffic is refused" ||
  fail "usesCleartextTraffic is not false"

[ "$(attribute allowBackup)" = "false" ] &&
  pass "backup is off" ||
  fail "allowBackup is not false"

grep -qE 'android:scheme\(0x[0-9a-f]+\)="cwork"' <<< "$manifest" &&
  grep -qE 'android:host\(0x[0-9a-f]+\)="connect"' <<< "$manifest" &&
  pass "cwork://connect opens the app" ||
  fail "no intent filter for cwork://connect"

signer="$("$tools/apksigner" verify --print-certs "$apk")" || fail "the signature does not verify"
grep -m 2 -E "certificate (DN|SHA-256 digest)" <<< "$signer" || true
if [ "$release" = "--release" ]; then
  grep -q "CN=Android Debug" <<< "$signer" &&
    fail "signed with a debug key — the next release could not update it" ||
    pass "signed with the release key"
fi

exit "$failed"
