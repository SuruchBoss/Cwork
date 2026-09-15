# syntax=docker/dockerfile:1

# ---- deps -------------------------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# Prisma's engines need OpenSSL at build and run time.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci

# ---- build ------------------------------------------------------------------
FROM deps AS build
COPY prisma ./prisma
COPY prisma.config.ts tsconfig*.json nest-cli.json ./
RUN npx prisma generate
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- runtime ----------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl curl \
    && rm -rf /var/lib/apt/lists/*

# Run as a non-root user: a compromised process should not own the filesystem.
RUN useradd --system --create-home --uid 10001 marma
USER marma

COPY --chown=marma:marma --from=build /app/node_modules ./node_modules
COPY --chown=marma:marma --from=build /app/dist ./dist
COPY --chown=marma:marma --from=build /app/prisma ./prisma
COPY --chown=marma:marma prisma.config.ts package.json ./

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/health/ready || exit 1

CMD ["node", "dist/main.js"]
