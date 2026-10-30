import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readRepoFile = (path) => readFile(resolve(repoDir, path), "utf8");
const dockerfile = await readRepoFile("Dockerfile");
const caddyDockerfile = await readRepoFile("deploy/caddy/Dockerfile");
const productionCompose = await readRepoFile("compose.prod.yaml");
const localCompose = await readRepoFile("compose.prod.local.yaml");
const developmentCompose = await readRepoFile("compose.yaml");
const candidateBuilder = await readRepoFile("scripts/build-release-candidate.sh");
const provenanceChecker = await readRepoFile("scripts/check-release-provenance.sh");

test("Node build stages share the verified multi-platform digest", () => {
  assert.match(dockerfile, /FROM node:24\.22\.2-alpine@sha256:4eefa1bfce4197942661ef9148247d779ddf1bb0ee006d3294a467609de60724 AS base/);
  assert.match(dockerfile, /FROM base AS revision-check/);
  assert.match(dockerfile, /FROM revision-check AS dependencies/);
  assert.match(dockerfile, /FROM base AS builder/);
  assert.match(dockerfile, /FROM revision-check AS runner/);
  assert.match(dockerfile, /rm -rf \/usr\/local\/lib\/node_modules\/npm/);
  assert.match(caddyDockerfile, /FROM caddy:2\.11\.7-alpine@sha256:04913b1da43339a40ad1ea87827d70a576ac5aa6cf674c6e24fdca675887533a/);
  assert.match(caddyDockerfile, /brotli-libs-1\.2\.1-r0\.apk/);
  assert.match(productionCompose, /postgres:16\.15-alpine@sha256:cbf42f0edc946c0bc1b8eeed62403734e1f25dc67a3491455d07a92fdb558b28/);
  assert.match(productionCompose, /AROMAN_CADDY_IMAGE:\?Set AROMAN_CADDY_IMAGE to an approved immutable image digest/);
});

test("release builds require a full revision and local simulation is explicitly isolated", () => {
  assert.match(dockerfile, /ARG AROMAN_RELEASE_CANDIDATE=true/);
  assert.match(dockerfile, /40-character Git SHA/);
  assert.match(dockerfile, /LABEL org\.opencontainers\.image\.revision=\$AROMAN_BUILD_REVISION/);
  assert.match(productionCompose, /AROMAN_BUILD_REVISION: \$\{AROMAN_BUILD_REVISION:\?Set AROMAN_BUILD_REVISION/);
  assert.match(localCompose, /AROMAN_RELEASE_CANDIDATE: "false"/);
  assert.match(developmentCompose, /AROMAN_RELEASE_CANDIDATE: "false"/);
  assert.match(candidateBuilder, /git status --porcelain/);
  assert.match(candidateBuilder, /must match this checkout's HEAD/);
  assert.match(candidateBuilder, /require_nonempty AROMAN_DOMAIN/);
  assert.match(candidateBuilder, /config --quiet/);
  assert.match(candidateBuilder, /org\.opencontainers\.image\.revision/);
  assert.match(provenanceChecker, /docker info/);
  assert.match(provenanceChecker, /docker buildx version/);
  assert.match(provenanceChecker, /--pull --no-cache/);
  assert.match(provenanceChecker, /grep -Fq "\$expected_diagnostic"/);
  assert.equal(provenanceChecker.match(/valid_revision=(a+)/)?.[1].length, 40);
});
