import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import { ReadableStream } from "node:stream/web";
import test from "node:test";
import { TextEncoder } from "node:util";

const baseUrl = process.env.TEST_BASE_URL;
const dbContainer = process.env.TEST_DB_CONTAINER;
const dbUser = process.env.TEST_DB_USER;
const dbName = process.env.TEST_DB_NAME;
const legacyEmail = process.env.TEST_LEGACY_EMAIL;
const enabled = Boolean(baseUrl && dbContainer && dbUser && dbName && legacyEmail);

function psql(sql) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      dbContainer,
      "psql",
      "-X",
      "--set",
      "ON_ERROR_STOP=1",
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

function applyMigration() {
  const migration = readFileSync("db/migrations/002_add_phone_waitlist.sql", "utf8");
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      dbContainer,
      "psql",
      "-X",
      "--set",
      "ON_ERROR_STOP=1",
      "--username",
      dbUser,
      "--dbname",
      dbName,
    ],
    { input: migration, stdio: ["pipe", "ignore", "pipe"] },
  );
}

async function register(body, ipAddress) {
  const response = await globalThis.fetch(`${baseUrl}/api/waitlist`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "aroman-integration-test",
      "X-Forwarded-For": ipAddress,
    },
    body: JSON.stringify(body),
  });

  const payload = response.headers.get("content-type")?.includes("application/json")
    ? await response.json()
    : null;
  return { response, payload };
}

async function postRaw(body, ipAddress, contentType = "application/json") {
  const response = await globalThis.fetch(`${baseUrl}/api/waitlist`, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      "User-Agent": "aroman-integration-test",
      "X-Forwarded-For": ipAddress,
    },
    body,
  });

  const payload = response.headers.get("content-type")?.includes("application/json")
    ? await response.json()
    : null;
  return { response, payload };
}

async function postChunked(chunks, ipAddress) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  const response = await globalThis.fetch(`${baseUrl}/api/waitlist`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "aroman-integration-test",
      "X-Forwarded-For": ipAddress,
    },
    body,
    duplex: "half",
  });

  const payload = response.headers.get("content-type")?.includes("application/json")
    ? await response.json()
    : null;
  return { response, payload };
}

test(
  "PostgreSQL-backed mobile waitlist integration",
  { skip: enabled ? false : "Docker integration environment is not configured" },
  async (t) => {
    await t.test("migration is idempotent", () => {
      applyMigration();
      applyMigration();

      assert.equal(
        psql(
          "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'waitlist_subscriptions' AND column_name = 'phone_e164'",
        ),
        "1",
      );
      assert.equal(
        psql(
          "SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'waitlist_subscriptions' AND column_name = 'email'",
        ),
        "YES",
      );
    });

    await t.test("existing email-only registration is preserved", () => {
      assert.equal(
        psql(
          `SELECT email || '|' || (phone_e164 IS NULL)::text || '|' || marketing_consent::text || '|' || (created_at IS NOT NULL)::text || '|' || (consented_at IS NOT NULL)::text FROM waitlist_subscriptions WHERE email = '${legacyEmail}'`,
        ),
        `${legacyEmail}|true|true|true|true`,
      );
    });

    await t.test("contact-method constraint rejects empty subscriptions", () => {
      assert.equal(
        psql(
          "DO $$ BEGIN BEGIN INSERT INTO waitlist_subscriptions (marketing_consent, consented_at, ip_hash, source) VALUES (TRUE, NOW(), repeat('a', 64), 'integration-test'); RAISE EXCEPTION 'contact constraint was not enforced'; EXCEPTION WHEN check_violation THEN NULL; END; END $$; SELECT 'enforced'",
        ),
        "DO\nenforced",
      );
    });

    await t.test("rejects an invalid phone", async () => {
      const { response, payload } = await register(
        { phone: "02112345678", consent: true, website: "" },
        "203.0.113.40",
      );
      assert.equal(response.status, 400);
      assert.equal(payload.code, "INVALID_PHONE");
    });

    await t.test("requires explicit consent", async () => {
      const { response, payload } = await register(
        { phone: "09120000001", consent: false, website: "" },
        "203.0.113.41",
      );
      assert.equal(response.status, 400);
      assert.equal(payload.code, "CONSENT_REQUIRED");
    });

    await t.test("rejects the honeypot", async () => {
      const { response, payload } = await register(
        { phone: "09120000001", consent: true, website: "bot" },
        "203.0.113.42",
      );
      assert.equal(response.status, 400);
      assert.equal(payload.code, "INVALID_REQUEST");
    });

    await t.test("rejects invalid media types and oversized request bodies", async () => {
      const unsupported = await postRaw(
        JSON.stringify({ phone: "09120000001", consent: true, website: "" }),
        "203.0.113.45",
        "text/plain",
      );
      assert.equal(unsupported.response.status, 415);
      assert.equal(unsupported.payload.code, "UNSUPPORTED_MEDIA_TYPE");
      assert.equal(unsupported.response.headers.get("cache-control"), "no-store");

      const oversized = await postRaw(
        JSON.stringify({
          phone: "09120000001",
          consent: true,
          website: "",
          padding: "x".repeat(5000),
        }),
        "203.0.113.46",
      );
      assert.equal(oversized.response.status, 413);
      if (oversized.payload) {
        assert.equal(oversized.payload.code, "REQUEST_TOO_LARGE");
        assert.equal(oversized.response.headers.get("cache-control"), "no-store");
      }

      const chunked = await postChunked(
        [
          '{"phone":"09120000001","consent":true,"padding":"',
          "x".repeat(5000),
          '"}',
        ],
        "203.0.113.48",
      );
      assert.equal(chunked.response.status, 413);
      if (chunked.payload) assert.equal(chunked.payload.code, "REQUEST_TOO_LARGE");

      const nullPayload = await postRaw("null", "203.0.113.47");
      assert.equal(nullPayload.response.status, 400);
      assert.equal(nullPayload.payload.code, "INVALID_REQUEST");
    });

    await t.test("new and duplicate phones receive the same public response", async () => {
      const first = await register(
        { phone: "۰۹۱۲ ۰۰۰ ۰۰۰۱", consent: true, website: "" },
        "203.0.113.43",
      );
      assert.equal(first.response.status, 202);
      assert.equal(first.payload.code, "REQUEST_ACCEPTED");
      assert.equal(first.response.headers.get("cache-control"), "no-store");
      assert.equal(
        first.payload.message,
        "ممنون! شماره‌ات برای لیست دعوت آرومان دریافت شد.",
      );

      const timestampsBeforeDuplicate = psql(
        "SELECT created_at::text || '|' || consented_at::text FROM waitlist_subscriptions WHERE phone_e164 = '+989120000001'",
      );

      const duplicate = await register(
        { phone: "00989120000001", consent: true, website: "" },
        "203.0.113.43",
      );
      assert.equal(duplicate.response.status, 202);
      assert.deepEqual(duplicate.payload, first.payload);
      assert.equal(duplicate.response.headers.get("cache-control"), "no-store");

      assert.equal(
        psql(
          "SELECT count(*)::text || '|' || min(phone_e164) || '|' || bool_and(email IS NULL)::text || '|' || bool_and(marketing_consent)::text FROM waitlist_subscriptions WHERE phone_e164 = '+989120000001'",
        ),
        "1|+989120000001|true|true",
      );
      assert.equal(
        psql(
          "SELECT created_at::text || '|' || consented_at::text FROM waitlist_subscriptions WHERE phone_e164 = '+989120000001'",
        ),
        timestampsBeforeDuplicate,
      );
    });

    await t.test("rate limits the sixth valid attempt in a window", async () => {
      // The production proxy correctly collapses all local test requests to
      // its one canonical client address. Start this isolated scenario clean.
      psql("TRUNCATE TABLE waitlist_rate_limits");
      for (let index = 10; index < 15; index += 1) {
        const result = await register(
          { phone: `091200000${index}`, consent: true, website: "" },
          "203.0.113.44",
        );
        assert.equal(result.response.status, 202);
      }

      const limited = await register(
        { phone: "09120000015", consent: true, website: "" },
        "203.0.113.44",
      );
      assert.equal(limited.response.status, 429);
      assert.equal(limited.payload.code, "RATE_LIMITED");
      assert.equal(limited.response.headers.get("retry-after"), "600");
      assert.equal(limited.response.headers.get("cache-control"), "no-store");
    });
  },
);
