import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readRepoFile = (path) => readFile(resolve(repoDir, path), "utf8");
const dockerfile = await readRepoFile("Dockerfile");
const caddyDockerfile = await readRepoFile("deploy/caddy/Dockerfile");
const productionCompose = await readRepoFile("compose.prod.yaml");
const localCompose = await readRepoFile("compose.prod.local.yaml");
const developmentCompose = await readRepoFile("compose.yaml");
const candidateBuilder = await readRepoFile("scripts/build-release-candidate.sh");
const provenanceChecker = await readRepoFile("scripts/check-release-provenance.sh");
const caddyImageValidator = resolve(repoDir, "scripts/validate-production-caddy-image.sh");
const deploymentInstructions = await readRepoFile("docs/production-deployment.md");

test("Node build stages share the verified multi-platform digest", () => {
  assert.match(dockerfile, /FROM node:24\.22\.2-alpine@sha256:4eefa1bfce4197942661ef9148247d779ddf1bb0ee006d3294a467609de60724 AS base/);
  assert.match(dockerfile, /^# syntax=docker\/dockerfile:1@sha256:[a-f0-9]{64}$/m);
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
  assert.match(candidateBuilder, /docker build/);
  assert.doesNotMatch(candidateBuilder, /compose.*config/);
  assert.doesNotMatch(candidateBuilder, /AROMAN_CADDY_IMAGE/);
  assert.match(candidateBuilder, /AROMAN_BUILD_REVISION/);
  assert.match(candidateBuilder, /org\.opencontainers\.image\.revision/);
  assert.match(provenanceChecker, /docker info/);
  assert.match(provenanceChecker, /docker buildx version/);
  assert.match(provenanceChecker, /timeout --signal=TERM/);
  assert.match(provenanceChecker, /--no-cache-filter revision-check/);
  assert.doesNotMatch(provenanceChecker, /--pull --no-cache/);
  assert.match(provenanceChecker, /invalid_revision=not-a-git-sha/);
  assert.match(provenanceChecker, /short_hex_revision=abc123/);
  assert.match(provenanceChecker, /empty_revision=''/);
  assert.match(provenanceChecker, /grep -Fq "\$expected_diagnostic"/);
  assert.match(provenanceChecker, /valid_revision=(a+)/);
  assert.match(provenanceChecker, /status == 124/);
  assert.match(provenanceChecker, /retain_diagnostics=true/);
  assert.equal(provenanceChecker.match(/valid_revision=(a+)/)?.[1].length, 40);
});

test("web-only release builds forward every public build setting without secrets", () => {
  const publicArguments = [
    ["AROMAN_BUILD_REVISION", "$revision"],
    ["NEXT_PUBLIC_SITE_URL", "$NEXT_PUBLIC_SITE_URL"],
    ["NEXT_PUBLIC_PRIVACY_EMAIL", "$NEXT_PUBLIC_PRIVACY_EMAIL"],
    ["NEXT_PUBLIC_INSTAGRAM_URL", "${NEXT_PUBLIC_INSTAGRAM_URL:-}"],
    ["NEXT_PUBLIC_TELEGRAM_URL", "${NEXT_PUBLIC_TELEGRAM_URL:-}"],
    ["NEXT_PUBLIC_LINKEDIN_URL", "${NEXT_PUBLIC_LINKEDIN_URL:-}"],
  ];
  for (const [name, value] of publicArguments) {
    assert.ok(
      candidateBuilder.includes(`--build-arg "${name}=${value}"`),
      `candidate build must explicitly forward ${name}`,
    );
  }

  for (const name of ["AROMAN_DOMAIN", "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_PRIVACY_EMAIL"]) {
    assert.ok(candidateBuilder.includes(`require_nonempty ${name}`));
  }
  assert.match(candidateBuilder, /image="aroman-coming-soon:\$AROMAN_IMAGE_TAG"/);
  assert.match(candidateBuilder, /AROMAN_IMAGE_TAG="\$revision"/);
  assert.match(candidateBuilder, /git status --porcelain/);
  assert.ok(candidateBuilder.includes('label=$(docker image inspect --format \'{{index .Config.Labels "org.opencontainers.image.revision"}}\' "$image")'));
  assert.match(candidateBuilder, /\[\[ "\$label" == "\$revision" \]\]/);
  assert.doesNotMatch(candidateBuilder, /--build-arg "(?:DATABASE|POSTGRES|WAITLIST|.*PASSWORD|.*SECRET)[A-Z_]*=/i);
  assert.doesNotMatch(candidateBuilder, /AROMAN_CADDY_IMAGE/);

  assert.match(dockerfile, /ARG NEXT_PUBLIC_SITE_URL=http:\/\/localhost:3000/);
  assert.match(dockerfile, /ENV NEXT_PUBLIC_SITE_URL=\$NEXT_PUBLIC_SITE_URL/);
  for (const name of ["INSTAGRAM_URL", "TELEGRAM_URL", "LINKEDIN_URL"]) {
    assert.match(dockerfile, new RegExp(`ARG NEXT_PUBLIC_${name}(?:\\n|$)`));
  }
  assert.match(productionCompose, /AROMAN_CADDY_IMAGE:\?Set AROMAN_CADDY_IMAGE to an approved immutable image digest/);
  const validatorAt = deploymentInstructions.indexOf("./scripts/validate-production-caddy-image.sh");
  const deploymentComposeAt = deploymentInstructions.indexOf("docker compose --env-file /etc/aroman/production.env -f compose.prod.yaml config --quiet");
  assert.ok(validatorAt >= 0 && deploymentComposeAt > validatorAt);
});

test("production Caddy references require a well-formed immutable sha256 digest", () => {
  const accepted = [
    `ghcr.io/aromanco/caddy@sha256:${"a".repeat(64)}`,
    `registry.example.test:5443/security/caddy@sha256:${"0".repeat(64)}`,
  ];
  const rejected = [
    "",
    "caddy:2.11.7-alpine",
    "aroman-caddy:local",
    "${AROMAN_CADDY_IMAGE}",
    `ghcr.io/aromanco/caddy@sha256:${"a".repeat(63)}`,
    `ghcr.io/aromanco/caddy@sha256:${"A".repeat(64)}`,
    `ghcr.io/aromanco/caddy@sha256:${"a".repeat(64)} trailing`,
  ];

  for (const image of accepted) {
    const result = spawnSync("bash", [caddyImageValidator], {
      env: { ...process.env, AROMAN_CADDY_IMAGE: image },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, `${image}: ${result.stderr}`);
  }

  for (const image of rejected) {
    const result = spawnSync("bash", [caddyImageValidator], {
      env: { ...process.env, AROMAN_CADDY_IMAGE: image },
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0, `${image} unexpectedly passed`);
  }
});
