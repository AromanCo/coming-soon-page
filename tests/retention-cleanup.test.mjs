import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { URL } from "node:url";
import test from "node:test";

const cleanupScript = new URL("../scripts/cleanup-waitlist-retention.sh", import.meta.url);
const scratch = await mkdtemp(path.join(os.tmpdir(), "aroman-retention-guard-"));
const fakeBin = path.join(scratch, "bin");
const argsCapture = path.join(scratch, "psql-args");
const sqlCapture = path.join(scratch, "psql-sql");
await mkdir(fakeBin);
const fakePsql = path.join(fakeBin, "psql");
await writeFile(fakePsql, `#!/bin/sh
printf '%s\\n' "$*" >> "$PSQL_ARGS_CAPTURE"
cat >> "$PSQL_SQL_CAPTURE"
printf '{}\\n'
`);
await chmod(fakePsql, 0o700);

function environment(overrides = {}) {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  delete env.PGPASSWORD;
  delete env.PGPASSWORD_FILE;
  env.PGHOST = "127.0.0.1";
  env.PGUSER = "retention-test";
  env.PGDATABASE = "retention-test";
  env.PATH = `${fakeBin}:${process.env.PATH ?? ""}`;
  env.PSQL_ARGS_CAPTURE = argsCapture;
  env.PSQL_SQL_CAPTURE = sqlCapture;
  env.REGISTRATION_RETENTION_DAYS = "30";
  env.RATE_LIMIT_RETENTION_DAYS = "7";
  env.RETENTION_CLEANUP_APPROVED = "YES";
  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[name];
    else env[name] = value;
  }
  return env;
}

function invoke(args = [], overrides = {}) {
  return spawnSync("bash", [cleanupScript.pathname, ...args], {
    encoding: "utf8",
    env: environment(overrides),
  });
}

async function clearCaptures() {
  await Promise.all([
    writeFile(argsCapture, ""),
    writeFile(sqlCapture, ""),
  ]);
}

test("retention cleanup fails closed on missing or invalid retention values", async (t) => {
  const invalidCases = [
    ["missing registration period", { REGISTRATION_RETENTION_DAYS: undefined }, "REGISTRATION_RETENTION_DAYS"],
    ["missing rate-limit period", { RATE_LIMIT_RETENTION_DAYS: undefined }, "RATE_LIMIT_RETENTION_DAYS"],
    ["zero registration period", { REGISTRATION_RETENTION_DAYS: "0" }, "REGISTRATION_RETENTION_DAYS"],
    ["zero rate-limit period", { RATE_LIMIT_RETENTION_DAYS: "0" }, "RATE_LIMIT_RETENTION_DAYS"],
    ["invalid registration period", { REGISTRATION_RETENTION_DAYS: "thirty" }, "REGISTRATION_RETENTION_DAYS"],
    ["invalid rate-limit period", { RATE_LIMIT_RETENTION_DAYS: "7d" }, "RATE_LIMIT_RETENTION_DAYS"],
    ["negative registration period", { REGISTRATION_RETENTION_DAYS: "-1" }, "REGISTRATION_RETENTION_DAYS"],
    ["negative rate-limit period", { RATE_LIMIT_RETENTION_DAYS: "-7" }, "RATE_LIMIT_RETENTION_DAYS"],
  ];

  for (const [name, overrides, expectedMessage] of invalidCases) {
    await t.test(name, async () => {
      await clearCaptures();
      const result = invoke(["--execute"], overrides);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, new RegExp(expectedMessage));
      assert.equal(await readFile(argsCapture, "utf8"), "", "psql was not invoked");
    });
  }
});

test("dry-run is the default and sends only count queries", async () => {
  await clearCaptures();
  const result = invoke();
  assert.equal(result.status, 0, result.stderr);
  const sql = await readFile(sqlCapture, "utf8");
  assert.match(sql, /SET TIME ZONE 'UTC'/);
  assert.match(sql, /json_build_object/);
  assert.doesNotMatch(sql, /\bDELETE\b|\bTRUNCATE\b/i);
});

test("execute requires explicit approval and accepts only batches up to 500", async (t) => {
  await clearCaptures();
  const unapproved = invoke(["--execute"], { RETENTION_CLEANUP_APPROVED: undefined });
  assert.notEqual(unapproved.status, 0);
  assert.match(unapproved.stderr, /RETENTION_CLEANUP_APPROVED=YES/);
  assert.equal(await readFile(argsCapture, "utf8"), "", "unapproved deletion did not invoke psql");

  for (const batch of ["0", "-1", "many", "501"]) {
    await t.test(`rejects batch limit ${batch}`, async () => {
      await clearCaptures();
      const result = invoke(["--execute"], { RETENTION_BATCH_LIMIT: batch });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /RETENTION_BATCH_LIMIT must be between 1 and 500/);
      assert.equal(await readFile(argsCapture, "utf8"), "", "invalid batch did not invoke psql");
    });
  }

  await clearCaptures();
  const maximum = invoke(["--execute"], { RETENTION_BATCH_LIMIT: "500" });
  assert.equal(maximum.status, 0, maximum.stderr);
  assert.match(await readFile(argsCapture, "utf8"), /batch_limit=500/);
  assert.match(await readFile(sqlCapture, "utf8"), /BEGIN;[\s\S]*DELETE FROM public\.waitlist_subscriptions[\s\S]*DELETE FROM public\.waitlist_rate_limits[\s\S]*COMMIT;/);
});

test.after(async () => {
  await rm(scratch, { recursive: true, force: true });
});
