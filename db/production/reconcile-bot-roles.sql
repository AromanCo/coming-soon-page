\set telegram_bot_password `tr -d '\n' < /run/secrets/db_telegram_bot_password`
\set bale_bot_password `tr -d '\n' < /run/secrets/db_bale_bot_password`

BEGIN;

SELECT format(
  'CREATE ROLE aroman_bot_telegram LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 6',
  :'telegram_bot_password'
)
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'aroman_bot_telegram')
\gexec
ALTER ROLE aroman_bot_telegram WITH LOGIN PASSWORD :'telegram_bot_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 6;

SELECT format(
  'CREATE ROLE aroman_bot_bale LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 6',
  :'bale_bot_password'
)
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'aroman_bot_bale')
\gexec
ALTER ROLE aroman_bot_bale WITH LOGIN PASSWORD :'bale_bot_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 6;

-- Remove membership paths in both directions, including SET ROLE paths.
DO $$
DECLARE
  edge RECORD;
BEGIN
  FOR edge IN
    SELECT granted.rolname AS granted_role, member.rolname AS member_role
    FROM pg_auth_members memberships
    JOIN pg_roles granted ON granted.oid = memberships.roleid
    JOIN pg_roles member ON member.oid = memberships.member
    WHERE granted.rolname IN ('aroman_bot_telegram', 'aroman_bot_bale')
       OR member.rolname IN ('aroman_bot_telegram', 'aroman_bot_bale')
  LOOP
    EXECUTE format('REVOKE %I FROM %I', edge.granted_role, edge.member_role);
  END LOOP;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_database
    WHERE datname = current_database()
      AND datdba IN ('aroman_bot_telegram'::regrole, 'aroman_bot_bale'::regrole)
  ) THEN
    RAISE EXCEPTION 'A provider bot role must not own the database';
  END IF;
END
$$;

-- RLS is ineffective if a provider login owns any database object: owners bypass
-- row policies. Refuse reconciliation rather than silently transferring ownership.
DO $$
DECLARE
  owned_object TEXT;
  owner_role TEXT;
BEGIN
  SELECT roles.rolname, pg_describe_object(dependencies.classid, dependencies.objid, dependencies.objsubid)
    INTO owner_role, owned_object
  FROM pg_shdepend AS dependencies
  JOIN pg_roles AS roles ON roles.oid = dependencies.refobjid
  WHERE dependencies.refclassid = 'pg_authid'::regclass
    AND dependencies.deptype = 'o'
    AND roles.rolname IN ('aroman_bot_telegram', 'aroman_bot_bale')
  ORDER BY roles.rolname
  LIMIT 1;

  IF owned_object IS NOT NULL THEN
    RAISE EXCEPTION 'Provider role % owns database object %; transfer ownership to a trusted migration/admin role before provisioning', owner_role, owned_object;
  END IF;
END
$$;

-- Retire the former shared login if present. RLS also denies it provider rows.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aroman_bot') THEN
    ALTER ROLE aroman_bot NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
  END IF;
END
$$;

COMMIT;
