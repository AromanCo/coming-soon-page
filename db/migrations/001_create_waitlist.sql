BEGIN;

CREATE TABLE IF NOT EXISTS waitlist_subscriptions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  marketing_consent BOOLEAN NOT NULL CHECK (marketing_consent = TRUE),
  consented_at TIMESTAMPTZ NOT NULL,
  ip_hash CHAR(64) NOT NULL,
  user_agent VARCHAR(500),
  source VARCHAR(50) NOT NULL DEFAULT 'coming-soon',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT waitlist_email_normalized CHECK (email = LOWER(email))
);

CREATE TABLE IF NOT EXISTS waitlist_rate_limits (
  ip_hash CHAR(64) NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  PRIMARY KEY (ip_hash, window_start)
);

CREATE INDEX IF NOT EXISTS waitlist_subscriptions_created_at_idx
  ON waitlist_subscriptions (created_at DESC);

CREATE INDEX IF NOT EXISTS waitlist_rate_limits_window_start_idx
  ON waitlist_rate_limits (window_start);

COMMIT;
