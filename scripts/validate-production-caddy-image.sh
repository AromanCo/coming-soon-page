#!/usr/bin/env bash
set -Eeuo pipefail

image=${AROMAN_CADDY_IMAGE:-}
if [[ -z "${image//[[:space:]]/}" ]]; then
  echo "Set AROMAN_CADDY_IMAGE to an approved immutable image digest." >&2
  exit 1
fi

# Require a lowercase Docker repository name followed by an explicit sha256
# digest. Tags, placeholders, whitespace, and malformed digests fail closed.
if [[ ! "$image" =~ ^[a-z0-9]+([.-][a-z0-9]+)*(:[0-9]+)?(/[a-z0-9]+([._-][a-z0-9]+)*)*@sha256:[0-9a-f]{64}$ ]]; then
  echo "AROMAN_CADDY_IMAGE must be a repository reference with an explicit lowercase sha256 digest." >&2
  exit 1
fi

printf 'Production Caddy image reference is immutable: %s\n' "$image"
