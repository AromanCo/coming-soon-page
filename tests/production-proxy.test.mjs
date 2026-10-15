import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import process from "node:process";
import test from "node:test";

const baseUrl = process.env.TEST_BASE_URL;
const dbContainer = process.env.TEST_DB_CONTAINER;
const dbUser = process.env.TEST_DB_USER;
const dbName = process.env.TEST_DB_NAME;
const enabled = Boolean(baseUrl && dbContainer && dbUser && dbName);

function psql(sql) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      dbContainer,
      "psql",
      "-X",
      "--username",
      dbUser,
      "--dbname",
      dbName,
      "--tuples-only",
      "--no-align",
      "--command",
      sql,
    ],
    { encoding: "utf8" },
  ).trim();
}

async function register(headers = {}, body = undefined) {
  const response = await globalThis.fetch(`${baseUrl}/api/waitlist`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "aroman-production-proxy-test",
      ...headers,
    },
    body:
      body ??
      JSON.stringify({
        phone: "09120009999",
        consent: true,
        website: "",
      }),
  });

  let payload = null;
  if (response.headers.get("content-type")?.includes("application/json")) {
    payload = await response.json();
  }
  return { response, payload };
}

async function assertSpoofedHeaderCannotRotateIdentity(headerName) {
  psql("TRUNCATE TABLE waitlist_rate_limits");
  const statuses = [];

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const result = await register({
      [headerName]: `198.51.100.${attempt}`,
    });
    statuses.push(result.response.status);
  }

  assert.deepEqual(statuses, [202, 202, 202, 202, 202, 429]);
}

test(
  "production Caddy trust boundary and waitlist behavior",
  { skip: enabled ? false : "Production simulation is not configured" },
  async (t) => {
    await t.test("health is routed through Caddy", async () => {
      const response = await globalThis.fetch(`${baseUrl}/api/health`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: "ok" });
    });

    await t.test("valid and duplicate registrations are indistinguishable", async () => {
      psql("TRUNCATE TABLE waitlist_rate_limits");
      const first = await register();
      const duplicate = await register();

      assert.equal(first.response.status, 202);
      assert.equal(duplicate.response.status, 202);
      assert.deepEqual(duplicate.payload, first.payload);
      assert.equal(first.response.headers.get("cache-control"), "no-store");
    });

    await t.test("invalid phone and missing consent remain rejected", async () => {
      const invalidPhone = await register(
        {},
        JSON.stringify({ phone: "02112345678", consent: true, website: "" }),
      );
      assert.equal(invalidPhone.response.status, 400);
      assert.equal(invalidPhone.payload.code, "INVALID_PHONE");

      const missingConsent = await register(
        {},
        JSON.stringify({ phone: "09120009999", consent: false, website: "" }),
      );
      assert.equal(missingConsent.response.status, 400);
      assert.equal(missingConsent.payload.code, "CONSENT_REQUIRED");
    });

    await t.test("Caddy rejects excessive request bodies", async () => {
      const result = await register(
        {},
        JSON.stringify({
          phone: "09120009999",
          consent: true,
          website: "",
          padding: "x".repeat(5000),
        }),
      );
      assert.equal(result.response.status, 413);
    });

    await t.test("spoofed X-Forwarded-For cannot rotate identity", async () => {
      await assertSpoofedHeaderCannotRotateIdentity("X-Forwarded-For");
    });

    await t.test("spoofed X-Real-IP cannot rotate identity", async () => {
      await assertSpoofedHeaderCannotRotateIdentity("X-Real-IP");
    });

    await t.test("spoofed canonical header cannot rotate identity", async () => {
      await assertSpoofedHeaderCannotRotateIdentity("X-Aroman-Client-IP");
    });
  },
);
