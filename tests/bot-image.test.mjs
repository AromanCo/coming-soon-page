import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";

const manifest = JSON.parse(
  readFileSync(new URL("../deploy/bot-runtime/package.json", import.meta.url), "utf8"),
);
const lock = JSON.parse(
  readFileSync(new URL("../deploy/bot-runtime/package-lock.json", import.meta.url), "utf8"),
);
const dockerfile = readFileSync(new URL("../Dockerfile.bot", import.meta.url), "utf8");

test("worker image installs only the locked pg runtime on pinned Node 24.21.0", () => {
  assert.deepEqual(manifest.dependencies, { pg: "8.23.1" });
  assert.equal(lock.packages[""].dependencies.pg, "8.23.1");
  assert.equal(lock.packages["node_modules/pg"].version, "8.23.1");
  assert.equal(lock.packages["node_modules/pg"].resolved, "https://registry.npmjs.org/pg/-/pg-8.23.1.tgz");
  assert.ok(lock.packages["node_modules/pg"].integrity);
  assert.ok(!Object.keys(lock.packages).some((name) => /node_modules\/(next|react|react-dom)$/.test(name)));
  assert.match(dockerfile, /node:24\.21\.0-alpine3\.23@sha256:[a-f0-9]{64}/);
  assert.match(dockerfile, /test "\$\(node --version\)" = "v24\.21\.0"/);
  assert.match(dockerfile, /version !== "8\.23\.1"/);
  assert.match(dockerfile, /org\.opencontainers\.image\.revision/);
  assert.match(dockerfile, /COPY deploy\/bot-runtime\/package\.json deploy\/bot-runtime\/package-lock\.json/);
  assert.doesNotMatch(dockerfile, /COPY package\.json package-lock\.json/);
});
