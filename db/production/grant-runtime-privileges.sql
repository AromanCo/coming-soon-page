BEGIN;

SELECT format('REVOKE ALL ON TABLE waitlist_subscriptions FROM %I', :'app_user')
\gexec
SELECT format('REVOKE ALL ON TABLE waitlist_rate_limits FROM %I', :'app_user')
\gexec
SELECT format('REVOKE ALL ON SEQUENCE waitlist_subscriptions_id_seq FROM %I', :'app_user')
\gexec

CREATE OR REPLACE FUNCTION public.aroman_register_rate_limit(p_ip_hash TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH attempt AS (
    INSERT INTO public.waitlist_rate_limits (ip_hash, window_start, attempt_count)
    VALUES (
      p_ip_hash,
      TO_TIMESTAMP(FLOOR(EXTRACT(EPOCH FROM CLOCK_TIMESTAMP()) / 600) * 600),
      1
    )
    ON CONFLICT (ip_hash, window_start)
    DO UPDATE SET attempt_count = public.waitlist_rate_limits.attempt_count + 1
    RETURNING attempt_count
  )
  SELECT attempt_count <= 5 FROM attempt;
$$;

CREATE OR REPLACE FUNCTION public.aroman_create_waitlist_subscription(
  p_phone_e164 TEXT,
  p_ip_hash TEXT,
  p_user_agent TEXT
)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH inserted AS (
    INSERT INTO public.waitlist_subscriptions (
      phone_e164,
      marketing_consent,
      consented_at,
      ip_hash,
      user_agent,
      source
    )
    VALUES (p_phone_e164, TRUE, NOW(), p_ip_hash, p_user_agent, 'coming-soon')
    ON CONFLICT (phone_e164) WHERE phone_e164 IS NOT NULL DO NOTHING
    RETURNING id
  )
  SELECT EXISTS (SELECT 1 FROM inserted);
$$;

REVOKE ALL ON FUNCTION public.aroman_register_rate_limit(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aroman_create_waitlist_subscription(TEXT, TEXT, TEXT) FROM PUBLIC;

SELECT format(
  'GRANT EXECUTE ON FUNCTION public.aroman_register_rate_limit(TEXT) TO %I',
  :'app_user'
)
\gexec
SELECT format(
  'GRANT EXECUTE ON FUNCTION public.aroman_create_waitlist_subscription(TEXT, TEXT, TEXT) TO %I',
  :'app_user'
)
\gexec

COMMIT;
