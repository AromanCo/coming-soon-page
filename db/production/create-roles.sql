\set admin_password `tr -d '\n' < /run/secrets/db_admin_password`
\set migration_password `tr -d '\n' < /run/secrets/db_migration_password`
\set app_password `tr -d '\n' < /run/secrets/db_app_password`

SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'admin_user', :'admin_password')
\gexec

SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 2',
  :'migration_user',
  :'migration_password'
)
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'migration_user')
\gexec

SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 10',
  :'app_user',
  :'app_password'
)
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'app_user')
\gexec

SELECT format(
  'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 2',
  :'migration_user',
  :'migration_password'
)
\gexec

SELECT format(
  'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 10',
  :'app_user',
  :'app_password'
)
\gexec

SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'database_name')
\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database_name', :'migration_user')
\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database_name', :'app_user')
\gexec

REVOKE ALL ON SCHEMA public FROM PUBLIC;
SELECT format('ALTER SCHEMA public OWNER TO %I', :'migration_user')
\gexec
SELECT format('GRANT USAGE, CREATE ON SCHEMA public TO %I', :'migration_user')
\gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'app_user')
\gexec

-- Existing installations may contain objects owned by the former bootstrap
-- superuser. Transfer ownership without dropping or recreating any object.
SELECT format('ALTER TABLE %I.%I OWNER TO %I', n.nspname, c.relname, :'migration_user')
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'f')
\gexec

SELECT format('ALTER SEQUENCE %I.%I OWNER TO %I', n.nspname, c.relname, :'migration_user')
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'S'
\gexec

SELECT format('ALTER VIEW %I.%I OWNER TO %I', n.nspname, c.relname, :'migration_user')
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'v'
\gexec

SELECT format('ALTER MATERIALIZED VIEW %I.%I OWNER TO %I', n.nspname, c.relname, :'migration_user')
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'm'
\gexec
