#!/usr/bin/env bash
set -Eeuo pipefail

# Operator-run maintenance only. The public runtime has no DELETE privileges.
mode=${1:---dry-run}
if [[ "$mode" != "--dry-run" && "$mode" != "--execute" ]]; then
  echo "Usage: $0 [--dry-run|--execute]" >&2
  exit 2
fi

positive_integer() {
  [[ "${!1:-}" =~ ^[1-9][0-9]{0,5}$ ]] || {
    echo "$1 must be a positive integer" >&2
    exit 2
  }
}
positive_integer REGISTRATION_RETENTION_DAYS
positive_integer RATE_LIMIT_RETENTION_DAYS
batch_limit=${RETENTION_BATCH_LIMIT:-200}
[[ "$batch_limit" =~ ^([1-9]|[1-9][0-9]|[1-4][0-9]{2}|500)$ ]] || {
  echo "RETENTION_BATCH_LIMIT must be between 1 and 500" >&2
  exit 2
}

if [[ "$mode" == "--execute" && "${RETENTION_CLEANUP_APPROVED:-}" != "YES" ]]; then
  echo "Destructive cleanup requires RETENTION_CLEANUP_APPROVED=YES" >&2
  exit 2
fi

if [[ -z "${DATABASE_URL:-}" && -z "${PGHOST:-}" ]]; then
  echo "DATABASE_URL or PGHOST is required (use an operator-controlled connection)" >&2
  exit 2
fi
if [[ -n "${PGPASSWORD_FILE:-}" ]]; then
  export PGPASSWORD
  PGPASSWORD=$(<"$PGPASSWORD_FILE")
fi

export PGCONNECT_TIMEOUT=${PGCONNECT_TIMEOUT:-5}
if [[ "$mode" == "--dry-run" ]]; then
  psql ${DATABASE_URL:+"$DATABASE_URL"} -X -q -v ON_ERROR_STOP=1 -At \
    -v registration_days="$REGISTRATION_RETENTION_DAYS" \
    -v rate_days="$RATE_LIMIT_RETENTION_DAYS" <<'SQL'
SET TIME ZONE 'UTC';
SELECT json_build_object(
  'mode', 'dry-run',
  'expired_registration_count', (SELECT count(*) FROM public.waitlist_subscriptions WHERE created_at < CURRENT_TIMESTAMP - make_interval(days => :'registration_days'::integer)),
  'expired_rate_limit_count', (SELECT count(*) FROM public.waitlist_rate_limits WHERE window_start < CURRENT_TIMESTAMP - make_interval(days => :'rate_days'::integer))
);
SQL
  exit
fi

# One bounded transaction; data deletion and its count-only audit record commit
# together. Repeated invocations are safe and eventually drain old rows.
psql ${DATABASE_URL:+"$DATABASE_URL"} -X -q -v ON_ERROR_STOP=1 -At \
  -v registration_days="$REGISTRATION_RETENTION_DAYS" \
  -v rate_days="$RATE_LIMIT_RETENTION_DAYS" \
  -v batch_limit="$batch_limit" <<'SQL'
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
WITH doomed AS (
  SELECT ctid FROM public.waitlist_subscriptions
  WHERE created_at < CURRENT_TIMESTAMP - make_interval(days => :'registration_days'::integer)
  ORDER BY created_at LIMIT :'batch_limit'::integer FOR UPDATE SKIP LOCKED
), removed AS (
  DELETE FROM public.waitlist_subscriptions AS target USING doomed
  WHERE target.ctid = doomed.ctid RETURNING 1
)
SELECT count(*)::integer AS registration_deleted FROM removed \gset
WITH doomed AS (
  SELECT ctid FROM public.waitlist_rate_limits
  WHERE window_start < CURRENT_TIMESTAMP - make_interval(days => :'rate_days'::integer)
  ORDER BY window_start LIMIT :'batch_limit'::integer FOR UPDATE SKIP LOCKED
), removed AS (
  DELETE FROM public.waitlist_rate_limits AS target USING doomed
  WHERE target.ctid = doomed.ctid RETURNING 1
)
SELECT count(*)::integer AS rate_limit_deleted FROM removed \gset
INSERT INTO public.waitlist_retention_cleanup_audit (
  registration_retention_days, rate_limit_retention_days,
  registration_rows_deleted, rate_limit_rows_deleted, batch_limit
) VALUES (
  :'registration_days'::integer, :'rate_days'::integer,
  :registration_deleted::integer, :rate_limit_deleted::integer, :'batch_limit'::integer
);
SELECT json_build_object('mode','execute','registration_deleted',:registration_deleted::integer,'rate_limit_deleted',:rate_limit_deleted::integer);
COMMIT;
SQL
