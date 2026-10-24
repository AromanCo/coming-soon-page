#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
compose=(docker compose --project-directory "$repo_dir" -f "$repo_dir/compose.yaml")

cd "$repo_dir"

"${compose[@]}" config --quiet

build_revision=$(git rev-parse HEAD 2>/dev/null || printf 'unknown')
if [[ -n "$(git status --porcelain --untracked-files=normal 2>/dev/null)" ]]; then
  build_revision="${build_revision}-dirty"
fi

export AROMAN_BUILD_REVISION="$build_revision"

echo "Building the development web image from revision: $AROMAN_BUILD_REVISION"
"${compose[@]}" build web

echo "Starting PostgreSQL without removing or recreating its named volume."
"${compose[@]}" up -d --wait db

echo "Applying idempotent database migrations."
"${compose[@]}" run --rm --no-deps migrate

echo "Recreating only the web container from the newly built image."
"${compose[@]}" up -d --no-deps --force-recreate --wait web

web_container=$("${compose[@]}" ps -q web)
[[ -n "$web_container" ]] || {
  echo "The web container was not created." >&2
  exit 1
}

running_revision=$(docker inspect \
  --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' \
  "$web_container")

if [[ "$running_revision" != "$AROMAN_BUILD_REVISION" ]]; then
  echo "Revision mismatch: expected $AROMAN_BUILD_REVISION, found $running_revision" >&2
  exit 1
fi

"${compose[@]}" ps
echo "Development web container is running revision: $running_revision"
echo "Open http://localhost:${WEB_PORT:-3000}"
