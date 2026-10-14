import "server-only";

import { createHmac } from "node:crypto";
import { Pool, type PoolConfig } from "pg";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;

declare global {
  var aromanPostgresPool: Pool | undefined;
}

export function isWaitlistConfigured() {
  return Boolean(process.env.DATABASE_URL && process.env.WAITLIST_HASH_SECRET);
}

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!globalThis.aromanPostgresPool) {
    const config: PoolConfig = {
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    };

    if (process.env.DATABASE_SSL === "true") {
      config.ssl = {
        rejectUnauthorized:
          process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
      };
    }

    globalThis.aromanPostgresPool = new Pool(config);
  }

  return globalThis.aromanPostgresPool;
}

export function normalizeEmail(value: string) {
  return value.normalize("NFKC").trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return (
    email.length >= 5 &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(email)
  );
}

export function hashNetworkIdentifier(value: string) {
  const secret = process.env.WAITLIST_HASH_SECRET;

  if (!secret) {
    throw new Error("WAITLIST_HASH_SECRET is not configured");
  }

  return createHmac("sha256", secret).update(value).digest("hex");
}

export async function registerRateLimitAttempt(ipHash: string) {
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
  email: string;
  ipHash: string;
  userAgent: string | null;
};

export async function createSubscription({
  email,
  ipHash,
  userAgent,
}: CreateSubscriptionInput) {
  const result = await getPool().query<{ id: string }>(
    [
      "INSERT INTO waitlist_subscriptions (",
      "  email, marketing_consent, consented_at, ip_hash, user_agent, source",
      ")",
      "VALUES ($1, TRUE, NOW(), $2, $3, 'coming-soon')",
      "ON CONFLICT (email) DO NOTHING",
      "RETURNING id",
    ].join("\n"),
    [email, ipHash, userAgent],
  );

  return result.rowCount === 1;
}
