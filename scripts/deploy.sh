#!/bin/sh
# Builds the images, then (re)starts the stack. Run from the repository root on the server:
#   git pull && sh scripts/deploy.sh
#
# Same result as `docker compose up -d --build`, except that the images are built on the
# server's own network (`--network host`). On some VPSes, build containers cannot reach the
# internet and npm fails with ETIMEDOUT; Compose cannot build on the host network (its Bake
# builds do not grant the `network.host` entitlement), so the images are built here and
# tagged with the names Compose uses.
set -eu
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Missing .env: cp .env.example .env, then fill it in." >&2
  exit 1
fi

# Value of KEY in .env (last occurrence, without surrounding quotes or CR).
env_value() {
  sed -n "s/^$1=//p" .env | tail -n 1 | tr -d '\r' | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

docker build --network host -f apps/api/Dockerfile -t identity-api .
docker build --network host -f apps/web/Dockerfile -t identity-web \
  --build-arg VITE_MAP_TILE_URL="$(env_value VITE_MAP_TILE_URL)" \
  --build-arg VITE_MAP_ATTRIBUTION="$(env_value VITE_MAP_ATTRIBUTION)" \
  .

docker compose up -d
docker compose ps
