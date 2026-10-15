import "server-only";

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool, type PoolConfig } from "pg";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;

declare global {
  var aromanPostgresPool: Pool | undefined;
}

export function isWaitlistConfigured() {
  return Boolean(databaseConfigAvailable() && readSecret("WAITLIST_HASH_SECRET"));
}

function readSecret(name: "DATABASE_PASSWORD" | "WAITLIST_HASH_SECRET") {
  const inlineValue = process.env[name]?.trim();
  if (inlineValue) return inlineValue;

  const secretFile = process.env[`${name}_FILE`]?.trim();
  if (!secretFile) return undefined;

  try {
    const fileValue = readFileSync(secretFile, "utf8").trim();
    return fileValue || undefined;
  } catch {
    return undefined;
  }
}

function databaseConfigAvailable() {
  if (process.env.DATABASE_URL) return true;

  return Boolean(
    process.env.PGHOST &&
      process.env.PGDATABASE &&
      process.env.PGUSER &&
      readSecret("DATABASE_PASSWORD"),
  );
}

function getPool() {
  if (!databaseConfigAvailable()) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!globalThis.aromanPostgresPool) {
    const config: PoolConfig = {
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    };

    if (process.env.DATABASE_URL) {
      config.connectionString = process.env.DATABASE_URL;
    } else {
      config.host = process.env.PGHOST;
      config.port = Number(process.env.PGPORT ?? "5432");
      config.database = process.env.PGDATABASE;
      config.user = process.env.PGUSER;
      config.password = readSecret("DATABASE_PASSWORD");
    }

    if (process.env.DATABASE_SSL === "true") {
      config.ssl = {
        rejectUnauthorized:
          process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
      };
    }

    const pool = new Pool(config);

    // PostgreSQL restarts terminate idle connections. The pool discards those
    // clients automatically, but it still emits an event that must be handled
    // to keep the application process from treating it as uncaught.
    pool.on("error", (error) => {
      console.warn("PostgreSQL idle connection was closed", error.message);
    });

    globalThis.aromanPostgresPool = pool;
  }

  return globalThis.aromanPostgresPool;
}

export function hashNetworkIdentifier(value: string) {
  const secret = readSecret("WAITLIST_HASH_SECRET");

  if (!secret) {
    throw new Error("WAITLIST_HASH_SECRET is not configured");
  }

  return createHmac("sha256", secret).update(value).digest("hex");
}

export async function registerRateLimitAttempt(ipHash: string) {
  if (process.env.DATABASE_USE_LEAST_PRIVILEGE_FUNCTIONS === "true") {
    const result = await getPool().query<{ allowed: boolean }>(
      "SELECT public.aroman_register_rate_limit($1) AS allowed",
      [ipHash],
    );

    return result.rows[0]?.allowed === true;
  }

  const windowStart = new Date(
    Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS,
  );

  const result = await getPool().query<{ attempt_count: number }>(
    [
      "INSERT INTO waitlist_rate_limits (ip_hash, window_start, attempt_count)",
      "VALUES ($1, $2, 1)",
      "ON CONFLICT (ip_hash, window_start)",
      "DO UPDATE SET attempt_count = waitlist_rate_limits.attempt_count + 1",
      "RETURNING attempt_count",
    ].join("\n"),
    [ipHash, windowStart],
  );

  return result.rows[0].attempt_count <= RATE_LIMIT_MAX_ATTEMPTS;
}

type CreateSubscriptionInput = {
  phoneE164: string;
  ipHash: string;
  userAgent: string | null;
};

export async function createSubscription({
  phoneE164,
  ipHash,
  userAgent,
}: CreateSubscriptionInput) {
  if (process.env.DATABASE_USE_LEAST_PRIVILEGE_FUNCTIONS === "true") {
    const result = await getPool().query<{ inserted: boolean }>(
      "SELECT public.aroman_create_waitlist_subscription($1, $2, $3) AS inserted",
      [phoneE164, ipHash, userAgent],
    );

    return result.rows[0]?.inserted === true;
  }

  try {
    const result = await getPool().query<{ id: string }>(
      [
        "INSERT INTO waitlist_subscriptions (",
        "  phone_e164, marketing_consent, consented_at, ip_hash, user_agent, source",
        ")",
        "VALUES ($1, TRUE, NOW(), $2, $3, 'coming-soon')",
        "RETURNING id",
      ].join("\n"),
      [phoneE164, ipHash, userAgent],
    );

    return result.rowCount === 1;
  } catch (error) {
    const errorCode =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "UNKNOWN";

    if (errorCode === "23505") return false;
    throw error;
  }
}

export async function isWaitlistDatabaseReady() {
  const result = await getPool().query<{ ready: boolean }>(
    [
      "SELECT",
      "  to_regclass('public.waitlist_subscriptions') IS NOT NULL",
      "  AND to_regclass('public.waitlist_rate_limits') IS NOT NULL",
      "  AND EXISTS (",
      "    SELECT 1",
      "    FROM pg_catalog.pg_attribute AS attribute",
      "    JOIN pg_catalog.pg_class AS relation ON relation.oid = attribute.attrelid",
      "    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace",
      "    WHERE namespace.nspname = 'public'",
      "      AND relation.relname = 'waitlist_subscriptions'",
      "      AND attribute.attname = 'phone_e164'",
      "      AND attribute.attnum > 0",
      "      AND NOT attribute.attisdropped",
      "  )",
      "  AND EXISTS (",
      "    SELECT 1",
      "    FROM pg_catalog.pg_attribute AS attribute",
      "    JOIN pg_catalog.pg_class AS relation ON relation.oid = attribute.attrelid",
      "    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace",
      "    WHERE namespace.nspname = 'public'",
      "      AND relation.relname = 'waitlist_subscriptions'",
      "      AND attribute.attname = 'email'",
      "      AND attribute.attnum > 0",
      "      AND NOT attribute.attisdropped",
      "      AND NOT attribute.attnotnull",
      "  ) AS ready",
    ].join("\n"),
  );

  return result.rows[0]?.ready === true;
}
