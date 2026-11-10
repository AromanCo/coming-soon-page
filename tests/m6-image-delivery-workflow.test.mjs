import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { env } from "node:process";
import { test } from "node:test";
import { URL } from "node:url";

const workflow = readFileSync(
  new URL("../.github/workflows/m6-offline-image-delivery.yml", import.meta.url),
  "utf8",
);
const dockerfile = readFileSync(new URL("../Dockerfile.bot", import.meta.url), "utf8");
const botLockfile = JSON.parse(
  readFileSync(new URL("../deploy/bot-runtime/package-lock.json", import.meta.url), "utf8"),
);
const recipientGuardStep = workflow.match(
  / {6}- name: Require configured age recipient\n[\s\S]*?(?= {6}- name: Check out approved source revision)/,
)?.[0];
const recipientGuardRun = recipientGuardStep?.match(/ {8}run: \|\n((?: {10}.*\n)+)/)?.[1];
const recipientGuardScript = recipientGuardRun
  ?.split("\n")
  .filter(Boolean)
  .map((line) => line.slice(10))
  .join("\n");

test("M6 image workflow is pinned, age-encrypted, and review-branch runnable", () => {
  assert.match(workflow, /branches:\s+- "work\/m5-handoff-m6-bale-readiness-20261110"/);
  assert.doesNotMatch(workflow, /^\s+workflow_dispatch:/m);
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /permissions:\s+contents: read/);
  assert.match(workflow, /ref: 3b7438c7f68adbbe93f9e04a98a49b814d8d9bfe/);
  assert.match(workflow, /IMAGE_REF: aroman-scent-companion:3b7438c7f68adbbe93f9e04a98a49b814d8d9bfe-m6slim/);
  assert.match(workflow, /docker build --pull --platform linux\/amd64/);
  assert.match(workflow, /docker run --rm --pull=never --network none --read-only --cap-drop ALL/);
  assert.match(workflow, /pgVersion !== "8\.23\.1"/);
  assert.match(workflow, /process\.getuid\(\) === 0/);
  assert.match(
    dockerfile,
    /node:24\.21\.0-alpine3\.23@sha256:9ec4a2e289874ed0d722e1772ec2de45d2801541db8612f3638b26f128c69ac2/,
  );
  assert.match(dockerfile, /COPY deploy\/bot-runtime\/package\.json deploy\/bot-runtime\/package-lock\.json/);
  assert.equal(botLockfile.packages["node_modules/pg"].version, "8.23.1");
  assert.match(workflow, /AGE_RECIPIENT: \$\{\{ vars\.M6_AGE_RECIPIENT \}\}/);
  assert.match(workflow, /Required Actions variable M6_AGE_RECIPIENT is missing/);
  assert.match(workflow, /age1\[023456789acdefghjklmnpqrstuvwxyz\]/);
  assert.match(workflow, /age-v1\.3\.2-linux-amd64\.tar\.gz/);
  assert.match(workflow, /cbe24006683f8eb669266162894b9a522a1af52f2665fbc63a4bb032ed26ac10/);
  assert.match(workflow, /age --encrypt --recipient "\$AGE_RECIPIENT"/);
  assert.match(workflow, /test -s "\$probe_ciphertext"/);
  assert.match(workflow, /"\$age_inspect_bin" "\$probe_ciphertext" > \/dev\/null/);
  assert.match(workflow, /age-inspect "\$ENCRYPTED_ARCHIVE_NAME"/);
  assert.match(
    workflow,
    /docker save "\$IMAGE_REF" \\\n[ \t]*\| gzip -n -9 \\\n[ \t]*\| age --encrypt --recipient "\$AGE_RECIPIENT" > "\$ENCRYPTED_ARCHIVE_NAME"/,
  );
  assert.match(workflow, /sha256sum "\$ENCRYPTED_ARCHIVE_NAME" > "\$CIPHERTEXT_CHECKSUM_NAME"/);
  assert.match(workflow, /retention-days: 7/);
  assert.match(workflow, /ENCRYPTED_ARCHIVE_NAME: .*\.tar\.gz\.age/);
  assert.match(workflow, /CIPHERTEXT_CHECKSUM_NAME: .*\.tar\.gz\.age\.sha256/);
  assert.match(workflow, /ARTIFACT_NAME: .*m6slim-age/);
  const artifactPath = workflow.match(/^\s+path: \|\n((?:\s{12}.+\n)+)/m)?.[1];
  assert.ok(artifactPath, "upload-artifact path block exists");
  assert.deepEqual(
    artifactPath.trim().split("\n").map((path) => path.trim()),
    [
      "${{ env.ENCRYPTED_ARCHIVE_NAME }}",
      "${{ env.CIPHERTEXT_CHECKSUM_NAME }}",
      "${{ env.PROVENANCE_NAME }}",
    ],
  );
  assert.match(workflow, /set -euo pipefail[\s\S]*age --encrypt --recipient "\$AGE_RECIPIENT" > "\$ENCRYPTED_ARCHIVE_NAME"/);
  assert.match(workflow, /actions\/checkout@[0-9a-f]{40}/);
  assert.match(workflow, /actions\/upload-artifact@[0-9a-f]{40}/);
  assert.doesNotMatch(workflow, /docker push|ghcr\.io|packages:\s*write|\$\{\{\s*secrets\.|github\.event\.repository\.private|REPOSITORY_PRIVATE|AGE_PRIVATE_KEY|AGE_IDENTITY|age-keygen|--identity/);
  assert.doesNotMatch(
    workflow,
    /aroman-scent-companion-3b7438c7f68adbbe93f9e04a98a49b814d8d9bfe-m6slim\.tar\.gz(?:["\s]|$)/,
  );
});

test("M6 recipient guard rejects missing and malformed public keys", () => {
  assert.ok(recipientGuardScript, "recipient guard shell block exists");

  const runGuard = (recipient) =>
    spawnSync("bash", ["--noprofile", "--norc", "-c", recipientGuardScript], {
      encoding: "utf8",
      env: { PATH: env.PATH, AGE_RECIPIENT: recipient },
    });

  const missing = runGuard("");
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /M6_AGE_RECIPIENT is missing/);

  const malformed = runGuard("not-an-age-recipient");
  assert.equal(malformed.status, 1);
  assert.match(malformed.stderr, /must be an age bech32 recipient/);

  const syntacticallyValid = runGuard(
    "age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p",
  );
  assert.equal(syntacticallyValid.status, 0);
});
