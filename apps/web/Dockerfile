# syntax=docker/dockerfile:1
# Web app (static PWA) served by Caddy, which also proxies /api to the API and
# obtains HTTPS certificates automatically. Build context: the repository root.

FROM node:24-alpine AS build
WORKDIR /app
# Every workspace manifest: npm ci checks them against the lockfile.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund --workspace=@identity/web
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
