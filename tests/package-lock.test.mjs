import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { URL } from "node:url";

const lock = JSON.parse(
  readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
);

test("Next.js package tarballs use exact official npm registry paths", () => {
  const nextPackages = Object.entries(lock.packages).filter(
    ([name]) =>
      name === "node_modules/next" || name.startsWith("node_modules/@next/"),
  );

  assert.ok(nextPackages.length > 0);
  for (const [name, pkg] of nextPackages) {
    const packageName = name.replace("node_modules/", "");
    const tarballName = packageName.split("/").at(-1);
    assert.equal(
      pkg.resolved,
      `https://registry.npmjs.org/${packageName}/-/${tarballName}-${pkg.version}.tgz`,
    );
    assert.ok(pkg.integrity, `${packageName} must retain an integrity hash`);
  }
});
