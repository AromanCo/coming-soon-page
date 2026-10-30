#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
temp_dir=$(mktemp -d)
test_project="aroman-prod-sim-${RANDOM}-$$"
env_file="$temp_dir/production.env"
compose=(docker compose --env-file "$env_file" -f compose.prod.yaml -f compose.prod.local.yaml)

cleanup() {
  status=$?
  cd "$repo_dir"
  if (( status != 0 )); then
    "${compose[@]}" ps --all >&2 || true
    echo "Container logs withheld to keep personal data and secrets out of test output." >&2
  fi
  "${compose[@]}" down --remove-orphans >/dev/null 2>&1 || true
  rm -rf -- "$temp_dir"
  exit "$status"
}
trap cleanup EXIT

mkdir -p "$temp_dir/secrets"
chmod 0700 "$temp_dir/secrets"
for secret_name in db_admin_password db_migration_password db_app_password waitlist_hash_secret; do
  openssl rand -hex 32 >"$temp_dir/secrets/$secret_name"
  chmod 0600 "$temp_dir/secrets/$secret_name"
done

cat >"$env_file" <<EOF
COMPOSE_PROJECT_NAME=$test_project
AROMAN_DOMAIN=http://localhost
NEXT_PUBLIC_SITE_URL=http://localhost:8080
NEXT_PUBLIC_PRIVACY_EMAIL=privacy@example.test
POSTGRES_DB=aroman
POSTGRES_ADMIN_USER=aroman_admin
POSTGRES_MIGRATION_USER=aroman_migrate
POSTGRES_APP_USER=aroman_app
AROMAN_SECRETS_DIR=$temp_dir/secrets
LOCAL_HTTP_PORT=8080
EOF
chmod 0600 "$env_file"

cd "$repo_dir"
export AROMAN_BUILD_REVISION="$(git rev-parse HEAD)"

docker run --rm \
  --env AROMAN_DOMAIN=http://localhost \
  --volume "$repo_dir/deploy/caddy/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2.11.4-alpine@sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

"${compose[@]}" config --quiet
current_migrations=$(printf '%s\n' "$repo_dir"/db/migrations/*.sql | sed 's|.*/||')
sorted_migrations=$(printf '%s\n' "$current_migrations" | LC_ALL=C sort)
[[ "$current_migrations" == "$sorted_migrations" ]] || {
  echo "Migration glob order is not lexical" >&2
  exit 1
}
bot_compatibility_order=$(printf '%s\n' \
  003_create_scent_bot_sessions.sql \
  004_add_scent_bot_outbox.sql \
  005_retention_cleanup_audit.sql | LC_ALL=C sort)
[[ "$bot_compatibility_order" == $'003_create_scent_bot_sessions.sql\n004_add_scent_bot_outbox.sql\n005_retention_cleanup_audit.sql' ]] || {
  echo "Retention migration no longer follows the draft bot migration slots" >&2
  exit 1
}
service_list=$("${compose[@]}" config --services | sort | tr '\n' ' ')
[[ "$service_list" == "caddy db migrate web " ]] || {
  echo "Production website Compose unexpectedly contains extra services: $service_list" >&2
  exit 1
}
"${compose[@]}" up -d --wait db
"${compose[@]}" exec -T db /opt/aroman/db-admin/create-roles.sh
if [[ "${AROMAN_PRODUCTION_TEST_SKIP_BUILD:-false}" == "true" ]]; then
  "${compose[@]}" up -d --no-build --wait
else
  "${compose[@]}" up -d --build --wait
fi
# The migration runner processes the sorted migration glob; a second full pass
# proves all checked-in migrations, including 005, are repeatable.
"${compose[@]}" run --rm migrate

db_container=$("${compose[@]}" ps -q db)
web_container=$("${compose[@]}" ps -q web)
boundary_count=$(docker exec -i "$db_container" psql -X -U aroman_admin -d aroman -Atc \
  "WITH cutoff AS (SELECT statement_timestamp() AS as_of), boundary AS (SELECT as_of - INTERVAL '5 days' AS created_at, as_of FROM cutoff) SELECT count(*) FROM boundary WHERE created_at < as_of - INTERVAL '5 days'")
[[ "$boundary_count" == "0" ]] || {
  echo "A timestamp exactly on the retention cutoff was treated as expired" >&2
  exit 1
}
empty_retention=$(docker exec -i "$db_container" env \
  PGHOST=127.0.0.1 PGUSER=aroman_admin PGDATABASE=aroman \
  PGPASSWORD_FILE=/run/secrets/db_admin_password \
  REGISTRATION_RETENTION_DAYS=5 RATE_LIMIT_RETENTION_DAYS=5 \
  bash /opt/aroman/cleanup-waitlist-retention.sh --dry-run)
[[ "$empty_retention" == *'"expired_registration_count" : 0'* && "$empty_retention" == *'"expired_rate_limit_count" : 0'* ]] || {
  echo "Empty-database cleanup dry-run did not report zero counts" >&2
  exit 1
}
docker exec -i "$db_container" env \
  PGHOST=127.0.0.1 PGUSER=aroman_admin PGDATABASE=aroman \
  PGPASSWORD_FILE=/run/secrets/db_admin_password \
  REGISTRATION_RETENTION_DAYS=5 RATE_LIMIT_RETENTION_DAYS=5 \
  RETENTION_CLEANUP_APPROVED=YES \
  bash /opt/aroman/cleanup-waitlist-retention.sh --execute >/dev/null
docker exec -i "$db_container" psql -X -U aroman_admin -d aroman -v ON_ERROR_STOP=1 \
  -c "DELETE FROM waitlist_retention_cleanup_audit"
ingress_network=$(docker inspect \
  --format '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' \
  "$web_container" | awk '/_ingress$/ { print; exit }')

[[ -n "$ingress_network" ]] || {
  echo "Could not resolve the production ingress network" >&2
  exit 1
}

if [[ "$(docker inspect --format '{{json (index .NetworkSettings.Ports "3000/tcp")}}' "$web_container")" != "null" ]]; then
  echo "The web origin unexpectedly has a published port" >&2
  exit 1
fi
if [[ "$(docker inspect --format '{{json (index .NetworkSettings.Ports "5432/tcp")}}' "$db_container")" != "null" ]]; then
  echo "PostgreSQL unexpectedly has a published port" >&2
  exit 1
fi

missing_status=$(docker run --rm --network "$ingress_network" curlimages/curl:8.16.0 \
  --silent --output /dev/null --write-out '%{http_code}' \
  --header 'Content-Type: application/json' \
  --data '{"phone":"09120009999","consent":true,"website":""}' \
  http://web:3000/api/waitlist)
[[ "$missing_status" == "400" ]] || {
  echo "Missing canonical identity failed open with HTTP $missing_status" >&2
  exit 1
}

invalid_status=$(docker run --rm --network "$ingress_network" curlimages/curl:8.16.0 \
  --silent --output /dev/null --write-out '%{http_code}' \
  --header 'Content-Type: application/json' \
  --header 'X-Aroman-Client-IP: not-an-ip' \
  --data '{"phone":"09120009999","consent":true,"website":""}' \
  http://web:3000/api/waitlist)
[[ "$invalid_status" == "400" ]] || {
  echo "Malformed canonical identity failed open with HTTP $invalid_status" >&2
  exit 1
}

docker exec -i "$db_container" psql -X -U aroman_admin -d aroman -v ON_ERROR_STOP=1 \
  -c "INSERT INTO waitlist_subscriptions (email, marketing_consent, consented_at, ip_hash, source) VALUES ('ux12-legacy@example.test', TRUE, NOW(), repeat('e', 64), 'ux12-integration-fixture')"
TEST_BASE_URL=http://localhost:8080 \
TEST_DB_CONTAINER="$db_container" \
TEST_DB_USER=aroman_admin \
TEST_DB_NAME=aroman \
TEST_LEGACY_EMAIL=ux12-legacy@example.test \
  node --no-warnings --test tests/waitlist.integration.test.mjs

TEST_BASE_URL=http://localhost:8080 \
TEST_DB_CONTAINER="$db_container" \
TEST_DB_USER=aroman_admin \
TEST_DB_NAME=aroman \
  node --no-warnings --test tests/production-proxy.test.mjs

BASE_URL=http://localhost:8080 \
OUTPUT_DIR="${UX12_ARTIFACT_DIR:-$HOME/Dev/Aroman/qa-artifacts/coming-soon/ux-12}" \
  node tests/browser/navigation-a11y.mjs

role_flags=$(docker exec -i "$db_container" psql -X -U aroman_admin -d aroman \
  -Atc "SELECT rolname || '|' || rolsuper || '|' || rolcreatedb || '|' || rolcreaterole FROM pg_roles WHERE rolname IN ('aroman_app', 'aroman_migrate') ORDER BY rolname")
expected_flags=$'aroman_app|false|false|false\naroman_migrate|false|false|false'
[[ "$role_flags" == "$expected_flags" ]] || {
  echo "Production roles have unexpected elevated attributes" >&2
  exit 1
}

if docker exec -i "$db_container" sh -ec '
  export PGPASSWORD="$(cat /run/secrets/db_app_password)"
  psql -h 127.0.0.1 -U aroman_app -d aroman -v ON_ERROR_STOP=1 \
    -c "CREATE TABLE public.runtime_must_not_create (id integer)"
' >/dev/null 2>&1; then
  echo "Runtime role unexpectedly created a table" >&2
  exit 1
fi

# Exercise operator retention against synthetic rows only. All data and
# containers live in this unique test project/database.
docker exec -i "$db_container" psql -X -U aroman_admin -d aroman -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO waitlist_subscriptions
  (phone_e164, marketing_consent, consented_at, ip_hash, user_agent, source, created_at)
VALUES
  ('+989129999999', TRUE, NOW() - INTERVAL '10 days', repeat('a', 64), 'synthetic-test-agent', 'retention-test', NOW() - INTERVAL '10 days'),
  ('+989129999997', TRUE, NOW() - INTERVAL '10 days', repeat('b', 64), 'synthetic-test-agent', 'retention-test', NOW() - INTERVAL '10 days'),
  ('+989129999998', TRUE, NOW(), repeat('f', 64), 'synthetic-test-agent', 'retention-test', NOW());
INSERT INTO waitlist_rate_limits (ip_hash, window_start, attempt_count)
VALUES (repeat('c', 64), NOW() - INTERVAL '10 days', 1),
       (repeat('e', 64), NOW() - INTERVAL '10 days', 1),
       (repeat('d', 64), NOW(), 1),
       (repeat('f', 64), NOW(), 1);
SQL
cleanup_in_container() {
  docker exec -i "$db_container" env \
    PGHOST=127.0.0.1 PGUSER=aroman_admin PGDATABASE=aroman \
    PGPASSWORD_FILE=/run/secrets/db_admin_password \
    REGISTRATION_RETENTION_DAYS=5 RATE_LIMIT_RETENTION_DAYS=5 RETENTION_BATCH_LIMIT=1 \
    /bin/sh -ec 'bash /opt/aroman/cleanup-waitlist-retention.sh "$@"' -- "$1"
}
dry_run_output=$(cleanup_in_container --dry-run)
[[ "$dry_run_output" == *'"expired_registration_count" : 2'* || "$dry_run_output" == *'"expired_registration_count":2'* ]] || {
  echo "Retention dry-run did not report the expected count-only result" >&2
  exit 1
}
if cleanup_in_container --execute >/dev/null 2>&1; then
  echo "Retention execution unexpectedly passed without operator acknowledgment" >&2
  exit 1
fi
if docker exec -i "$db_container" psql -X -U aroman_admin -d aroman -Atc \
  "SELECT count(*) FROM waitlist_subscriptions WHERE source='retention-test' AND created_at < NOW() - INTERVAL '5 days'" | grep -qx '2'; then
  :
else
  echo "Dry-run or authorization check changed registration rows" >&2
  exit 1
fi
docker exec -i "$db_container" psql -X -U aroman_admin -d aroman -v ON_ERROR_STOP=1 \
  -c "ALTER TABLE waitlist_retention_cleanup_audit ADD CONSTRAINT ux12_test_force_rollback CHECK (batch_limit < 0)"
if docker exec -i "$db_container" env \
  PGHOST=127.0.0.1 PGUSER=aroman_admin PGDATABASE=aroman \
  PGPASSWORD_FILE=/run/secrets/db_admin_password \
  REGISTRATION_RETENTION_DAYS=5 RATE_LIMIT_RETENTION_DAYS=5 \
  RETENTION_CLEANUP_APPROVED=YES \
  bash /opt/aroman/cleanup-waitlist-retention.sh --execute >/dev/null 2>&1; then
  echo "Injected audit failure did not fail cleanup" >&2
  exit 1
fi
docker exec -i "$db_container" psql -X -U aroman_admin -d aroman -v ON_ERROR_STOP=1 \
  -c "ALTER TABLE waitlist_retention_cleanup_audit DROP CONSTRAINT ux12_test_force_rollback"
rollback_rows=$(docker exec -i "$db_container" psql -X -U aroman_admin -d aroman -Atc \
  "SELECT count(*) FROM waitlist_subscriptions WHERE source='retention-test' AND created_at < NOW() - INTERVAL '5 days'")
[[ "$rollback_rows" == "2" ]] || {
  echo "Cleanup failure did not roll back deletion" >&2
  exit 1
}
docker exec -i "$db_container" env \
  PGHOST=127.0.0.1 PGUSER=aroman_admin PGDATABASE=aroman \
  PGPASSWORD_FILE=/run/secrets/db_admin_password \
  REGISTRATION_RETENTION_DAYS=5 RATE_LIMIT_RETENTION_DAYS=5 RETENTION_BATCH_LIMIT=1 \
  RETENTION_CLEANUP_APPROVED=YES \
  bash /opt/aroman/cleanup-waitlist-retention.sh --execute >/dev/null
bounded_state=$(docker exec -i "$db_container" psql -X -U aroman_admin -d aroman -Atc \
  "SELECT (SELECT count(*) FROM waitlist_subscriptions WHERE source='retention-test' AND created_at < NOW() - INTERVAL '5 days') || '|' || (SELECT count(*) FROM waitlist_rate_limits WHERE ip_hash IN (repeat('c',64),repeat('e',64)) AND window_start < NOW() - INTERVAL '5 days') || '|' || (SELECT count(*) FROM waitlist_retention_cleanup_audit)")
[[ "$bounded_state" == "1|1|1" ]] || {
  echo "A single cleanup invocation exceeded its configured batch size" >&2
  exit 1
}
docker exec -i "$db_container" env \
  PGHOST=127.0.0.1 PGUSER=aroman_admin PGDATABASE=aroman \
  PGPASSWORD_FILE=/run/secrets/db_admin_password \
  REGISTRATION_RETENTION_DAYS=5 RATE_LIMIT_RETENTION_DAYS=5 RETENTION_BATCH_LIMIT=1 \
  RETENTION_CLEANUP_APPROVED=YES \
  bash /opt/aroman/cleanup-waitlist-retention.sh --execute >/dev/null
retention_state=$(docker exec -i "$db_container" psql -X -U aroman_admin -d aroman -Atc \
  "SELECT (SELECT count(*) FROM waitlist_subscriptions WHERE source='retention-test') || '|' || (SELECT count(*) FROM waitlist_rate_limits WHERE ip_hash IN (repeat('c',64),repeat('d',64),repeat('e',64),repeat('f',64))) || '|' || (SELECT count(*) FROM waitlist_retention_cleanup_audit)")
[[ "$retention_state" == "1|2|2" ]] || {
  echo "Retention was not bounded, repeatable, or correctly audited" >&2
  exit 1
}
docker exec -i "$db_container" psql -X -U aroman_admin -d aroman -v ON_ERROR_STOP=1 \
  -c "DELETE FROM waitlist_subscriptions WHERE source='retention-test'; DELETE FROM waitlist_rate_limits WHERE ip_hash IN (repeat('c',64),repeat('d',64),repeat('e',64),repeat('f',64)); DELETE FROM waitlist_retention_cleanup_audit"

if docker exec -i "$db_container" sh -ec '
  export PGPASSWORD="$(cat /run/secrets/db_app_password)"
  psql -h 127.0.0.1 -U aroman_app -d aroman -v ON_ERROR_STOP=1 \
    -c "SELECT phone_e164 FROM waitlist_subscriptions LIMIT 1"
' >/dev/null 2>&1; then
  echo "Runtime role unexpectedly read stored phone numbers" >&2
  exit 1
fi

if docker exec -i "$db_container" sh -ec '
  export PGPASSWORD="$(cat /run/secrets/db_app_password)"
  psql -h 127.0.0.1 -U aroman_app -d aroman -v ON_ERROR_STOP=1 \
    -c "INSERT INTO waitlist_subscriptions DEFAULT VALUES"
' >/dev/null 2>&1; then
  echo "Runtime role unexpectedly inserted directly into the subscription table" >&2
  exit 1
fi

if docker exec -i "$db_container" sh -ec '
  export PGPASSWORD="$(cat /run/secrets/db_app_password)"
  psql -h 127.0.0.1 -U aroman_app -d aroman -v ON_ERROR_STOP=1 \
    -c "DELETE FROM waitlist_rate_limits"
' >/dev/null 2>&1; then
  echo "Runtime role unexpectedly deleted retention-controlled rows" >&2
  exit 1
fi

before_restart=$(docker exec -i "$db_container" psql -X -U aroman_admin -d aroman \
  -Atc "SELECT count(*) FROM waitlist_subscriptions")
"${compose[@]}" restart db web
"${compose[@]}" up -d --wait db web caddy
after_restart=$(docker exec -i "$db_container" psql -X -U aroman_admin -d aroman \
  -Atc "SELECT count(*) FROM waitlist_subscriptions")
[[ "$before_restart" == "$after_restart" ]] || {
  echo "Registration count changed across restart" >&2
  exit 1
}

if "${compose[@]}" logs caddy web | grep -Eq '0912000[0-9]+|198\.51\.100\.|aroman-production-proxy-test|aroman-integration-test'; then
  echo "Sensitive test input appeared in application or proxy logs" >&2
  exit 1
fi
for secret_name in db_admin_password db_migration_password db_app_password waitlist_hash_secret; do
  secret_value=$(<"$temp_dir/secrets/$secret_name")
  if "${compose[@]}" logs --no-color caddy web db migrate | grep -Fq -- "$secret_value"; then
    echo "A test secret appeared in application, proxy, or database logs" >&2
    exit 1
  fi
done

openssl rand -hex 32 >"$temp_dir/backup-passphrase"
chmod 0600 "$temp_dir/backup-passphrase"
mkdir -p "$temp_dir/backups"
cat >"$temp_dir/backup.env" <<EOF
AROMAN_APP_DIR=$repo_dir
AROMAN_ENV_FILE=$env_file
AROMAN_BACKUP_DIR=$temp_dir/backups
AROMAN_BACKUP_PASSPHRASE_FILE=$temp_dir/backup-passphrase
AROMAN_BACKUP_RETENTION_DAYS=7
AROMAN_BACKUP_REMOTE=
EOF
chmod 0600 "$temp_dir/backup.env"

AROMAN_BACKUP_CONFIG="$temp_dir/backup.env" ./scripts/backup-postgres.sh
AROMAN_BACKUP_CONFIG="$temp_dir/backup.env" ./scripts/verify-latest-backup.sh
backup_count=$(find "$temp_dir/backups" -maxdepth 1 -type f \
  -name 'aroman-postgres-*.dump.gpg' | wc -l)
[[ "$backup_count" == "1" ]] || {
  echo "Expected exactly one encrypted backup artifact" >&2
  exit 1
}

echo "Production-stack and encrypted restore simulation passed; volumes were preserved."
