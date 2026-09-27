# syntax=docker/dockerfile:1
# Copyright 2026 Suruch Chakrapeesirisuk
# SPDX-License-Identifier: Apache-2.0

# The public demo (CW-031): the console and the API in one image, for one free
# Render web service — the free tier has no private network for two services
# to talk over, and one service is half the instance hours. Built from the
# repository root:
#
#   docker build -f deploy/demo/Dockerfile -t cwork-demo .
#
# docs/demo.md is the runbook. A normal installation uses backend/Dockerfile
# and web/Dockerfile through docker-compose.yml, not this.

# ---- console ------------------------------------------------------------------
FROM node:22-bookworm-slim AS console
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
# The API serves the console from the same origin, so it is reached by path.
ENV VITE_API_BASE_URL=/api/v1
RUN npm run build

# ---- api ----------------------------------------------------------------------
FROM node:22-bookworm-slim AS api
WORKDIR /app
# Prisma's engines need OpenSSL at build and run time.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY backend/package*.json ./
RUN npm ci
COPY backend/prisma ./prisma
COPY backend/prisma.config.ts backend/tsconfig*.json backend/nest-cli.json ./
RUN npx prisma generate
COPY backend/src ./src
RUN npm run build
# Production dependencies, plus what the entrypoint's migration step runs. The
# Prisma CLI survives the prune by itself — it is an optional peer of
# @prisma/client — and the `test` says so rather than assuming it. dotenv, which
# prisma.config.ts imports, is a development dependency and has none of its own,
# so it is carried across the prune as it is.
RUN cp -r node_modules/dotenv /tmp/dotenv \
    && npm prune --omit=dev \
    && test -f node_modules/prisma/build/index.js \
    && cp -r /tmp/dotenv node_modules/dotenv

# ---- runtime ------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    CONSOLE_DIR=/app/console

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Run as a non-root user: a compromised process should not own the filesystem.
RUN useradd --system --create-home --uid 10001 cwork
USER cwork

COPY --chown=cwork:cwork --from=api /app/node_modules ./node_modules
COPY --chown=cwork:cwork --from=api /app/dist ./dist
COPY --chown=cwork:cwork --from=api /app/prisma ./prisma
COPY --chown=cwork:cwork backend/prisma.config.ts backend/package.json ./
# The Thai font embedded in generated certificates, read when the API boots.
COPY --chown=cwork:cwork backend/assets ./assets
COPY --chown=cwork:cwork --from=console /web/dist ./console

# Render tells the service which port to listen on (PORT); 3000 otherwise.
EXPOSE 3000

# Refuses a database the demo did not create, migrates only when a migration is
# pending, then starts the API — which seeds and resets the demo by itself.
# DEMO_MODE=true has to be set where the service is defined (render.yaml).
CMD ["node", "dist/modules/demo/demo-main.js"]
