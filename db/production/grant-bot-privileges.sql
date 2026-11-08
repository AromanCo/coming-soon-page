-- Run once per provider role after migrations 003, 004, 006, 007 and 008.
-- Inputs: psql variables database_name and bot_user.
BEGIN;

-- Never grant runtime access unless all provider tables have the expected
-- session_user-based RLS policy. This makes ordering mistakes fail closed.
DO $$
DECLARE
  expected_table TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname IN ('aroman_bot_telegram', 'aroman_bot_bale')
      AND (NOT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit)
  ) THEN
    RAISE EXCEPTION 'Provider bot roles must be LOGIN, NOINHERIT, and have no elevated role attributes';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_auth_members AS memberships
    JOIN pg_roles AS granted ON granted.oid = memberships.roleid
    JOIN pg_roles AS member ON member.oid = memberships.member
    WHERE granted.rolname IN ('aroman_bot_telegram', 'aroman_bot_bale')
       OR member.rolname IN ('aroman_bot_telegram', 'aroman_bot_bale')
  ) THEN
    RAISE EXCEPTION 'Provider bot roles must have no role memberships';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_shdepend AS dependencies
    WHERE dependencies.refclassid = 'pg_authid'::regclass
      AND dependencies.refobjid IN (
        SELECT oid FROM pg_roles WHERE rolname IN ('aroman_bot_telegram', 'aroman_bot_bale')
      )
      AND dependencies.deptype = 'o'
  ) THEN
    RAISE EXCEPTION 'Provider bot roles must not own database objects';
  END IF;

  FOREACH expected_table IN ARRAY ARRAY[
    'scent_bot_sessions',
    'scent_bot_poll_offsets',
    'scent_bot_outbox',
    'scent_bot_delivery_metrics'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class AS relations
      JOIN pg_namespace AS namespaces ON namespaces.oid = relations.relnamespace
      WHERE namespaces.nspname = 'public'
        AND relations.relname = expected_table
        AND relations.relrowsecurity
        AND NOT relations.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS must be enabled and not forced on public.% before granting bot access', expected_table;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies AS policies
      WHERE policies.schemaname = 'public'
        AND policies.tablename = expected_table
        AND policies.policyname = 'scent_bot_provider_isolation'
        AND policies.cmd = 'ALL'
        AND policies.qual ILIKE '%session_user%'
        AND policies.qual ILIKE '%aroman_bot_telegram%'
        AND policies.qual ILIKE '%aroman_bot_bale%'
        AND policies.with_check ILIKE '%session_user%'
        AND policies.with_check ILIKE '%aroman_bot_telegram%'
        AND policies.with_check ILIKE '%aroman_bot_bale%'
    ) THEN
      RAISE EXCEPTION 'Expected session_user provider-isolation policy is missing or incomplete on public.%', expected_table;
    END IF;
  END LOOP;
END
$$;

SELECT CASE
  WHEN :'bot_user' IN ('aroman_bot_telegram', 'aroman_bot_bale') THEN 'SELECT 1'
  ELSE 'DO $reject$ BEGIN RAISE EXCEPTION ''Unsupported provider bot role''; END $reject$'
END
\gexec

SELECT format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM %I', :'database_name', :'bot_user')
\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database_name', :'bot_user')
\gexec

SELECT format('REVOKE ALL PRIVILEGES ON SCHEMA public FROM %I', :'bot_user')
\gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'bot_user')
\gexec

SELECT format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I', :'bot_user')
\gexec
SELECT format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I', :'bot_user')
\gexec
SELECT format('REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public FROM %I', :'bot_user')
\gexec

-- The website's least-privilege entry points are SECURITY DEFINER. Remove
-- PUBLIC execution even on local stacks that do not run the website grant script.
DO $$
BEGIN
  IF to_regprocedure('public.aroman_register_rate_limit(text)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.aroman_register_rate_limit(TEXT) FROM PUBLIC';
  END IF;
  IF to_regprocedure('public.aroman_create_waitlist_subscription(text,text,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.aroman_create_waitlist_subscription(TEXT, TEXT, TEXT) FROM PUBLIC';
  END IF;
END
$$;

REVOKE ALL PRIVILEGES ON TABLE scent_bot_sessions, scent_bot_poll_offsets, scent_bot_outbox, scent_bot_delivery_metrics FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SEQUENCE scent_bot_outbox_id_seq FROM PUBLIC;

SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE scent_bot_sessions, scent_bot_poll_offsets, scent_bot_outbox TO %I', :'bot_user')
\gexec
SELECT format('GRANT SELECT, UPDATE ON TABLE scent_bot_delivery_metrics TO %I', :'bot_user')
\gexec
SELECT format('GRANT USAGE ON SEQUENCE scent_bot_outbox_id_seq TO %I', :'bot_user')
\gexec

COMMIT;
