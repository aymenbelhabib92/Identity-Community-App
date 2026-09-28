# syntax=docker/dockerfile:1
# Web app (static PWA) served by Caddy, which also proxies /api to the API and
# obtains HTTPS certificates automatically. Build context: the repository root.

# npm tuned for slow or flaky networks, with the npm cache shared with the API
# image (see apps/api/Dockerfile): installs run one at a time and reuse downloads.
FROM node:24-alpine AS build
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
RUN --mount=type=cache,id=identity-npm,target=/root/.npm,sharing=locked \
    npm ci --prefer-offline --workspace=@identity/web
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
ARG VITE_MAP_TILE_URL=""
ARG VITE_MAP_ATTRIBUTION=""
ENV VITE_MAP_TILE_URL=$VITE_MAP_TILE_URL \
    VITE_MAP_ATTRIBUTION=$VITE_MAP_ATTRIBUTION
RUN npm run build --workspace=@identity/web

FROM caddy:2-alpine
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
EXPOSE 80 443
