#!/bin/sh
# Copyright 2026 Suruch Chakrapeesirisuk
# SPDX-License-Identifier: Apache-2.0

# Builds images.tar.gz: every image the NAS needs, in one file, so that installing
# or updating there needs no internet, no Docker Hub and no npm (CW-062).
# Run it on a machine WITH Docker and the internet (a developer's PC), then copy
# the whole deploy/nas folder, images.tar.gz and images.version included, to the NAS.
#
#   ./make-bundle.sh [version]        e.g. ./make-bundle.sh 0.4.0
#
# The images are built for THIS machine's processor. A Synology DS925+ is x86-64,
# so build on x86-64 (a Mac with Apple silicon would make ARM images the NAS
# cannot run; images.version records the architecture and the scripts refuse a
# mismatch).

HERE=$(cd "$(dirname "$0")" && pwd)
V=${1:-$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$HERE/../../backend/package.json" | head -n 1)}
[ -n "$V" ] || { echo "give a version: ./make-bundle.sh 0.4.0" >&2; exit 1; }
case $(uname -m) in x86_64|amd64) ARCH=amd64 ;; aarch64|arm64) ARCH=arm64 ;; *) ARCH=$(uname -m) ;; esac

set -e
echo "== building cwork $V ($ARCH)"
docker build -t "cwork/api:$V" "$HERE/../../backend"
docker build --target build -t "cwork/tools:$V" "$HERE/../../backend"
docker build --build-arg VITE_API_BASE_URL=/api/v1 -t "cwork/web:$V" "$HERE/../../web"
docker pull pgvector/pgvector:pg16
docker pull caddy:2-alpine

echo "== saving (this takes a while)"
docker save "cwork/api:$V" "cwork/tools:$V" "cwork/web:$V" pgvector/pgvector:pg16 caddy:2-alpine \
  | gzip -c > "$HERE/images.tar.gz.partial"
mv "$HERE/images.tar.gz.partial" "$HERE/images.tar.gz"
printf '%s\n%s\n' "$V" "$ARCH" > "$HERE/images.version"
( cd "$HERE" && sha256sum images.tar.gz > images.tar.gz.sha256 )
echo "== done: $(du -h "$HERE/images.tar.gz" | awk '{print $1}')  version $V  $ARCH"
