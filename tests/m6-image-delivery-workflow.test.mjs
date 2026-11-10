import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";

const workflow = readFileSync(
  new URL("../.github/workflows/m6-offline-image-delivery.yml", import.meta.url),
  "utf8",
);

test("M6 image workflow is pinned, read-only, private-artifact-only, and review-branch runnable", () => {
  assert.match(workflow, /branches:\s+- "work\/m5-handoff-m6-bale-readiness-20261110"/);
  assert.doesNotMatch(workflow, /^\s+workflow_dispatch:/m);
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /permissions:\s+contents: read/);
  assert.match(workflow, /github\.event\.repository\.private/);
  assert.match(workflow, /ref: 3b7438c7f68adbbe93f9e04a98a49b814d8d9bfe/);
  assert.match(workflow, /IMAGE_REF: aroman-scent-companion:3b7438c7f68adbbe93f9e04a98a49b814d8d9bfe-m6slim/);
  assert.match(workflow, /docker build --pull --platform linux\/amd64/);
  assert.match(workflow, /docker run --rm --pull=never --network none --read-only --cap-drop ALL/);
  assert.match(workflow, /pgVersion !== "8\.23\.1"/);
  assert.match(workflow, /process\.getuid\(\) === 0/);
  assert.match(workflow, /gzip -n -9/);
  assert.match(workflow, /sha256sum "\$ARCHIVE_NAME"/);
  assert.match(workflow, /retention-days: 7/);
  assert.match(workflow, /actions\/checkout@[0-9a-f]{40}/);
  assert.match(workflow, /actions\/upload-artifact@[0-9a-f]{40}/);
  assert.doesNotMatch(workflow, /docker push|ghcr\.io|packages:\s*write|\$\{\{\s*secrets\./);
});
