#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_dir"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker CLI is required for release provenance verification." >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is unavailable; release provenance verification did not run." >&2
  exit 1
fi
if ! docker buildx version >/dev/null 2>&1; then
  echo "Docker Buildx is required for isolated revision-guard checks." >&2
  exit 1
fi

run_revision_check() {
  local name=$1
  local revision=$2
  local expected_diagnostic=$3
  local status=0
  local output

  if output=$(docker buildx build --pull --no-cache --progress=plain --target revision-check \
    --output=type=cacheonly \
    --build-arg AROMAN_RELEASE_CANDIDATE=true \
    --build-arg "AROMAN_BUILD_REVISION=$revision" \
    -f Dockerfile . 2>&1); then
    status=0
  else
    status=$?
  fi

  if (( status == 0 )); then
    echo "$name revision unexpectedly passed the rejection check." >&2
    return 1
  fi
  if ! grep -Fq "$expected_diagnostic" <<<"$output"; then
    echo "$name check failed for an unrelated Docker/build reason; revision guard was not verified." >&2
    echo "Diagnostic output was captured but withheld to avoid exposing environment data." >&2
    return 1
  fi
}

run_valid_revision_check() {
  local revision=$1
  local output
  if ! output=$(docker buildx build --pull --no-cache --progress=plain --target revision-check \
    --output=type=cacheonly \
    --build-arg AROMAN_RELEASE_CANDIDATE=true \
    --build-arg "AROMAN_BUILD_REVISION=$revision" \
    -f Dockerfile . 2>&1); then
    echo "A valid lowercase 40-character SHA failed its revision check; daemon, registry, or Dockerfile validation may be unavailable." >&2
    echo "Diagnostic output was captured but withheld to avoid exposing environment data." >&2
    return 1
  fi
}

invalid_revision=not-a-git-sha
short_hex_revision=abc123
empty_revision=''
valid_revision=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
run_revision_check invalid "$invalid_revision" "Release candidates require a full lowercase Git SHA"
run_revision_check short "$short_hex_revision" "Release candidates require a 40-character Git SHA"
run_revision_check missing "$empty_revision" "Release candidates require a full lowercase Git SHA"
run_valid_revision_check "$valid_revision"

echo "Dockerfile revision guard verified: malformed, short, and missing SHA rejected; valid 40-character lowercase SHA accepted."
