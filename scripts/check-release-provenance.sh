#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_dir"

if docker build --quiet --target runner \
  --build-arg AROMAN_RELEASE_CANDIDATE=true \
  --build-arg AROMAN_BUILD_REVISION=unknown \
  -t aroman-provenance-invalid-check . >/dev/null 2>&1; then
  echo "Invalid placeholder revision unexpectedly passed Dockerfile validation" >&2
  exit 1
fi

if env -u AROMAN_BUILD_REVISION \
  AROMAN_DOMAIN=http://localhost \
  NEXT_PUBLIC_SITE_URL=http://localhost \
  NEXT_PUBLIC_PRIVACY_EMAIL=privacy@example.test \
  docker compose --env-file /dev/null -f compose.prod.yaml config --quiet \
  >/dev/null 2>&1; then
  echo "Production Compose unexpectedly accepted missing revision metadata" >&2
  exit 1
fi

echo "Release provenance negative checks passed: placeholder and missing revisions rejected."
