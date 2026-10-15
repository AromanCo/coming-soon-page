#!/usr/bin/env bash
set -Eeuo pipefail

: "${AROMAN_BASE_URL:?Set AROMAN_BASE_URL, for example https://example.com}"
base_url=${AROMAN_BASE_URL%/}
response_file=$(mktemp)
trap 'rm -f -- "$response_file"' EXIT

health_status=$(curl --silent --show-error --output "$response_file" \
  --write-out '%{http_code}' "$base_url/api/health")
[[ "$health_status" == "200" ]] || {
  echo "Health check failed with HTTP $health_status" >&2
  exit 1
}
grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' "$response_file" || {
  echo "Health response was not ready" >&2
  exit 1
}
: >"$response_file"

headers=$(curl --silent --show-error --head "$base_url/")
grep -Eiq '^strict-transport-security:' <<<"$headers" || {
  echo "HSTS header is missing" >&2
  exit 1
}
grep -Eiq '^content-security-policy:' <<<"$headers" || {
  echo "Content-Security-Policy header is missing" >&2
  exit 1
}

if [[ -n "${SMOKE_TEST_PHONE:-}" ]]; then
  echo "Submitting the operator-provided synthetic smoke-test phone."
  status=$(curl --silent --show-error --output "$response_file" \
    --write-out '%{http_code}' \
    --header 'Content-Type: application/json' \
    --data "{\"phone\":\"$SMOKE_TEST_PHONE\",\"consent\":true,\"website\":\"\"}" \
    "$base_url/api/waitlist")
  [[ "$status" == "202" ]] || {
    echo "Synthetic signup failed with HTTP $status" >&2
    exit 1
  }
else
  echo "Signup write skipped; set SMOKE_TEST_PHONE only to a designated synthetic number."
fi

echo "Production smoke checks passed."
