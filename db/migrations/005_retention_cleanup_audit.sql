BEGIN;

CREATE TABLE IF NOT EXISTS waitlist_retention_cleanup_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  registration_retention_days INTEGER NOT NULL CHECK (registration_retention_days > 0),
  rate_limit_retention_days INTEGER NOT NULL CHECK (rate_limit_retention_days > 0),
  registration_rows_deleted INTEGER NOT NULL CHECK (registration_rows_deleted >= 0),
  rate_limit_rows_deleted INTEGER NOT NULL CHECK (rate_limit_rows_deleted >= 0),
  batch_limit INTEGER NOT NULL CHECK (batch_limit BETWEEN 1 AND 500)
);

REVOKE ALL ON TABLE waitlist_retention_cleanup_audit FROM PUBLIC;
COMMIT;
