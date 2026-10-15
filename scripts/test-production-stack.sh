#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
temp_dir=$(mktemp -d)
env_file="$temp_dir/production.env"
compose=(docker compose --env-file "$env_file" -f compose.prod.yaml -f compose.prod.local.yaml)

cleanup() {
  status=$?
  cd "$repo_dir"
  if (( status != 0 )); then
    "${compose[@]}" ps --all >&2 || true
    "${compose[@]}" logs --no-color --tail=200 >&2 || true
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
COMPOSE_PROJECT_NAME=aroman-prod-sim
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

docker run --rm \
  --env AROMAN_DOMAIN=http://localhost \
  --volume "$repo_dir/deploy/caddy/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2.11.4-alpine \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

"${compose[@]}" config --quiet
"${compose[@]}" up -d --wait db
"${compose[@]}" exec -T db /opt/aroman/db-admin/create-roles.sh
if [[ "${AROMAN_PRODUCTION_TEST_SKIP_BUILD:-false}" == "true" ]]; then
  "${compose[@]}" up -d --no-build --wait
else
  "${compose[@]}" up -d --build --wait
fi

db_container=$("${compose[@]}" ps -q db)
web_container=$("${compose[@]}" ps -q web)
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

TEST_BASE_URL=http://localhost:8080 \
TEST_DB_CONTAINER="$db_container" \
TEST_DB_USER=aroman_admin \
TEST_DB_NAME=aroman \
  node --no-warnings --test tests/production-proxy.test.mjs

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

if "${compose[@]}" logs caddy web | grep -Eq '09120009999|198\.51\.100\.'; then
  echo "Sensitive test input appeared in application or proxy logs" >&2
  exit 1
fi

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
