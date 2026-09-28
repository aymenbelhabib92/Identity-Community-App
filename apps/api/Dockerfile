# syntax=docker/dockerfile:1
# API image. Build context: the repository root (see docker-compose.yml).

# ─── Base of the build stages: npm tuned for slow or flaky networks (VPS) ────
# IPv4 first (build containers often lack working IPv6), patient retries, fewer
# parallel downloads. The npm cache is a shared cache mount ("sharing=locked"):
# the API and web installs run one at a time and reuse what is already
# downloaded, across stages and across rebuilds.
FROM node:24-alpine AS base
ENV NODE_OPTIONS=--dns-result-order=ipv4first \
    npm_config_fetch_retries=6 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_fetch_timeout=600000 \
    npm_config_maxsockets=6 \
    npm_config_audit=false \
    npm_config_fund=false \
    npm_config_update_notifier=false
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# ─── Build: bundle the API (the shared package is inlined) ───────────────────
FROM base AS build
RUN --mount=type=cache,id=identity-npm,target=/root/.npm,sharing=locked \
    npm ci --prefer-offline --workspace=@identity/api
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build --workspace=@identity/api

# ─── Production dependencies only ────────────────────────────────────────────
FROM base AS deps
RUN --mount=type=cache,id=identity-npm,target=/root/.npm,sharing=locked \
    npm ci --prefer-offline --omit=dev --workspace=@identity/api

# ─── Runtime ─────────────────────────────────────────────────────────────────
FROM node:24-alpine
ENV NODE_ENV=production \
    TZ=Africa/Tunis \
    UPLOAD_DIR=/data/uploads \
    PGLITE_DIR=/data/pglite
WORKDIR /app
# Declares the bundle as ES modules ("type": "module").
COPY apps/api/package.json ./package.json
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/drizzle ./drizzle
# Used by the optional demo seed (`docker compose exec api node dist/db/seed.js`).
COPY apps/api/src/db/seed-assets ./src/db/seed-assets
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "dist/server.js"]
