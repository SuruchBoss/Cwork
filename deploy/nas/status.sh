#!/bin/sh
# What is running, and whether the console answers.
. "$(dirname "$0")/lib.sh"
need_root; need_docker; load_env
dc ps
echo
if [ "${CWORK_MODE:-full}" != db ]; then
  if curl -fsS --noproxy "*" -m 10 --cacert "$HERE/cwork-office-ca.crt" "https://$CWORK_HOST:$CWORK_HTTPS_PORT/" >/dev/null 2>&1; then
    ok "https://$CWORK_HOST:$CWORK_HTTPS_PORT answers with a certificate this machine trusts"
  elif curl -ksS --noproxy "*" -m 10 "https://$CWORK_HOST:$CWORK_HTTPS_PORT/" >/dev/null 2>&1; then
    warn "https://$CWORK_HOST:$CWORK_HTTPS_PORT answers (run ./export-ca.sh first to check the certificate too)"
  else
    bad "https://$CWORK_HOST:$CWORK_HTTPS_PORT does not answer"
  fi
fi
