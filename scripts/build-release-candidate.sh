#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_dir"

require_nonempty() {
  local name=$1
  local value=${!name:-}
  if [[ -z "${value//[[:space:]]/}" ]]; then
    printf 'Set %s to the approved non-secret release configuration before building.\n' "$name" >&2
    exit 1
  fi
}

require_nonempty AROMAN_DOMAIN
require_nonempty NEXT_PUBLIC_SITE_URL
require_nonempty NEXT_PUBLIC_PRIVACY_EMAIL

revision=$(git rev-parse --verify HEAD)
if [[ ! "$revision" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Cannot identify a full Git commit SHA" >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Release candidate builds require a clean Git worktree" >&2
  exit 1
fi
if [[ "${AROMAN_BUILD_REVISION:-$revision}" != "$revision" ]]; then
  echo "AROMAN_BUILD_REVISION must match this checkout's HEAD ($revision)" >&2
  exit 1
fi
export AROMAN_BUILD_REVISION="$revision"
export AROMAN_IMAGE_TAG="$revision"
image="aroman-coming-soon:$AROMAN_IMAGE_TAG"

# A local web candidate does not need a published Caddy derivative. Build the
# production web Dockerfile directly so production Compose still requires its
# separately approved immutable Caddy registry digest.
docker build \
  --build-arg "AROMAN_BUILD_REVISION=$revision" \
  --build-arg "NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL" \
  --build-arg "NEXT_PUBLIC_INSTAGRAM_URL=${NEXT_PUBLIC_INSTAGRAM_URL:-}" \
  --build-arg "NEXT_PUBLIC_TELEGRAM_URL=${NEXT_PUBLIC_TELEGRAM_URL:-}" \
  --build-arg "NEXT_PUBLIC_LINKEDIN_URL=${NEXT_PUBLIC_LINKEDIN_URL:-}" \
  --build-arg "NEXT_PUBLIC_PRIVACY_EMAIL=$NEXT_PUBLIC_PRIVACY_EMAIL" \
  --tag "$image" \
  --file Dockerfile .
label=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")
image_id=$(docker image inspect --format '{{.Id}}' "$image")
[[ "$label" == "$revision" ]] || {
  echo "Image revision label mismatch: expected $revision, found $label" >&2
  exit 1
}
printf 'Local release candidate built: %s\nRevision label: %s\nLocal image ID: %s\n' "$image" "$label" "$image_id"
printf 'This local image ID is not a registry digest. No image was pushed.\n'
