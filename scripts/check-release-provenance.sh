#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_dir"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker CLI is required for release provenance verification." >&2
  exit 1
fi
if ! command -v timeout >/dev/null 2>&1; then
  echo "GNU timeout is required to bound release provenance verification." >&2
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

timeout_seconds=${AROMAN_PROVENANCE_TIMEOUT_SECONDS:-120}
if [[ ! "$timeout_seconds" =~ ^[1-9][0-9]*$ ]] || (( timeout_seconds > 600 )); then
  echo "AROMAN_PROVENANCE_TIMEOUT_SECONDS must be an integer from 1 to 600." >&2
  exit 1
fi

# Keep diagnostics outside the worktree, private to this user, and bounded.
umask 077
diagnostics_dir=$(mktemp -d "${TMPDIR:-/tmp}/aroman-release-provenance.XXXXXX")
chmod 0700 "$diagnostics_dir"
raw_log="$diagnostics_dir/command.raw.log"
diagnostic_log="$diagnostics_dir/diagnostics.log"
: >"$raw_log"
chmod 0600 "$raw_log"

retain_diagnostics=false
cleanup() {
  if [[ "$retain_diagnostics" == true ]]; then
    printf 'Bounded diagnostics retained outside the repository: %s\n' "$diagnostics_dir" >&2
  else
    rm -rf -- "$diagnostics_dir"
  fi
}
trap cleanup EXIT

run_bounded() {
  local label=$1
  shift
  local status=0
  : >"$raw_log"
  if timeout --signal=TERM --kill-after=10s "${timeout_seconds}s" "$@" >"$raw_log" 2>&1; then
    status=0
  else
    status=$?
  fi
  # Preserve only the last 64 KiB; command output is never printed verbatim.
  tail -c 65536 "$raw_log" >"$diagnostic_log"
  chmod 0600 "$diagnostic_log"
  : >"$raw_log"
  if (( status == 124 || status == 137 )); then
    retain_diagnostics=true
    echo "$label timed out after ${timeout_seconds}s (exit $status)." >&2
    classify_timeout "$label" "$diagnostic_log" >&2
    return 124
  fi
  return "$status"
}

classify_timeout() {
  local label=$1
  local log=$2
  if grep -Eqi 'load metadata for docker.io|resolve image config for docker.io|FROM docker.io/.+resolve|pulling fs layer|downloading [0-9]+/[0-9]+' "$log"; then
    echo "$label stalled while resolving or downloading a pinned image from Docker Hub; this is a registry/image transport timeout, not a SHA guard result."
  elif grep -Eqi 'failed to dial|no such host|temporary failure in name resolution|connection refused|i/o timeout|TLS handshake timeout|context deadline exceeded' "$log"; then
    echo "$label encountered a registry/network transport failure; this is not a SHA guard result."
  elif grep -Eqi 'no space left on device|out of memory|oomkilled|cannot allocate memory|resource temporarily unavailable|resourceexhausted' "$log"; then
    echo "$label encountered resource exhaustion; this is not a SHA guard result."
  elif grep -Eqi 'worker.*(unavailable|failed)|buildkit.*(unavailable|failed)|failed to solve:.*(worker|executor)' "$log"; then
    echo "$label stalled in the BuildKit worker/executor; this is not a SHA guard result."
  else
    echo "$label timed out without a classifiable Docker diagnostic; treat it as incomplete, never as a pass."
  fi
}

classify_failure() {
  local label=$1
  local log=$2
  if grep -Eqi 'no such host|temporary failure in name resolution|connection refused|i/o timeout|TLS handshake timeout|failed to fetch|failed to resolve source metadata|unexpected EOF' "$log"; then
    echo "$label failed during registry/network access; the requested check is incomplete." >&2
  elif grep -Eqi 'no space left on device|out of memory|oomkilled|cannot allocate memory|resource temporarily unavailable|resourceexhausted' "$log"; then
    echo "$label failed due to resource exhaustion; the requested check is incomplete." >&2
  elif grep -Eqi 'worker.*(unavailable|failed)|buildkit.*(unavailable|failed)|failed to solve:.*(worker|executor)' "$log"; then
    echo "$label failed in the BuildKit worker/executor; the requested check is incomplete." >&2
  else
    echo "$label failed for an unrelated Docker/build reason; the requested check is incomplete." >&2
  fi
}

base_image='node:24.22.2-alpine@sha256:4eefa1bfce4197942661ef9148247d779ddf1bb0ee006d3294a467609de60724'
if run_bounded "Pinned Node base prefetch" docker pull "$base_image"; then
  :
else
  status=$?
  if (( status == 124 )); then
    exit 1
  fi
  retain_diagnostics=true
  classify_failure "Pinned Node base prefetch" "$diagnostic_log"
  exit 1
fi

run_revision_check() {
  local name=$1
  local revision=$2
  local expected_diagnostic=$3
  local status=0

  if run_bounded "$name revision check" docker buildx build \
    --progress=plain --target revision-check --no-cache-filter revision-check \
    --output=type=cacheonly \
    --build-arg AROMAN_RELEASE_CANDIDATE=true \
    --build-arg "AROMAN_BUILD_REVISION=$revision" \
    -f Dockerfile .; then
    status=0
  else
    status=$?
  fi

  if (( status == 124 )); then
    exit 1
  fi
  if (( status == 0 )); then
    echo "$name revision unexpectedly passed the rejection check." >&2
    return 1
  fi
  if ! grep -Fq "$expected_diagnostic" "$diagnostic_log"; then
    retain_diagnostics=true
    classify_failure "$name revision check" "$diagnostic_log"
    echo "Expected the revision guard diagnostic; Docker output was retained privately." >&2
    return 1
  fi
}

run_valid_revision_check() {
  local revision=$1
  local status=0
  if run_bounded "Valid revision check" docker buildx build \
    --progress=plain --target revision-check --no-cache-filter revision-check \
    --output=type=cacheonly \
    --build-arg AROMAN_RELEASE_CANDIDATE=true \
    --build-arg "AROMAN_BUILD_REVISION=$revision" \
    -f Dockerfile .; then
    return 0
  else
    status=$?
  fi
  if (( status == 124 )); then
    exit 1
  fi
  retain_diagnostics=true
  classify_failure "Valid revision check" "$diagnostic_log"
  echo "Valid SHA did not complete successfully; it is not accepted." >&2
  return 1
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
