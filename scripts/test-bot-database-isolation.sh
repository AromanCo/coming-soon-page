#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
container_name="aroman-bot-db-test-${BASHPID:-$$}"
postgres_image="postgres:16.15-alpine@sha256:cbf42f0edc946c0bc1b8eeed62403734e1f25dc67a3491455d07a92fdb558b28"
admin_password="synthetic_ci_admin_pw_16_14"
telegram_password="synthetic_ci_telegram_pw_16_14"
bale_password="synthetic_ci_bale_pw_16_14"

for command in docker node python3; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Required command is missing: $command" >&2
    exit 1
  }
done

node -e 'if (Number(process.versions.node.split(".")[0]) < 24) process.exit(1)' || {
  echo "Node.js 24 or newer is required" >&2
  exit 1
}
[[ -d "$repo_dir/node_modules/pg" ]] || {
  echo "Run npm ci before this database integration harness" >&2
  exit 1
}

port=$(python3 - <<'PY'
import socket
with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    print(sock.getsockname()[1])
PY
)

cleanup() {
  status=$?
  trap - EXIT
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

echo "=== START ISOLATED POSTGRESQL 16.15 ==="
docker run --detach --rm \
  --name "$container_name" \
  --publish "127.0.0.1:${port}:5432" \
  --env POSTGRES_DB=bot_test \
  --env "POSTGRES_PASSWORD=$admin_password" \
  "$postgres_image" >/dev/null

ready=false
for attempt in $(seq 1 60); do
  if docker exec "$container_name" pg_isready -U postgres -d bot_test >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == "true" ]] || {
  echo "Disposable PostgreSQL did not become ready" >&2
  exit 1
}

admin_url="postgresql://postgres:${admin_password}@127.0.0.1:${port}/bot_test"
telegram_url="postgresql://aroman_bot_telegram:${telegram_password}@127.0.0.1:${port}/bot_test"
bale_url="postgresql://aroman_bot_bale:${bale_password}@127.0.0.1:${port}/bot_test"

echo "=== EXERCISE RLS WITH SYNTHETIC PROVIDER LOGINS ==="
(
  cd "$repo_dir"
  BOT_TEST_DATABASE_URL="$admin_url" node --no-warnings --test tests/scent-bot-rls.integration.test.mjs
)

echo "=== PREPARE SYNTHETIC ROLE SECRETS ==="
docker exec "$container_name" sh -ec 'umask 077; mkdir -p /run/secrets'
printf '%s\n' "$telegram_password" | docker exec -i "$container_name" sh -ec 'umask 077; cat > /run/secrets/db_telegram_bot_password'
printf '%s\n' "$bale_password" | docker exec -i "$container_name" sh -ec 'umask 077; cat > /run/secrets/db_bale_bot_password'

echo "=== EXERCISE RECONCILIATION WITHOUT THE OPTIONAL LEGACY ROLE ==="
docker exec -i "$container_name" psql -X -U postgres -d bot_test \
  --set ON_ERROR_STOP=1 --file - < "$repo_dir/db/production/reconcile-bot-roles.sql"

legacy_role_count=$(docker exec "$container_name" psql -X -U postgres -d bot_test -Atc \
  "SELECT count(*) FROM pg_roles WHERE rolname='aroman_bot'")
[[ "$legacy_role_count" == "0" ]] || {
  echo "Role reconciliation must not create the optional legacy bot role" >&2
  exit 1
}
provider_login_state=$(docker exec "$container_name" psql -X -U postgres -d bot_test -Atc "
  SELECT string_agg(CASE WHEN rolcanlogin THEN 't' ELSE 'f' END, '|' ORDER BY rolname)
  FROM pg_roles WHERE rolname IN ('aroman_bot_bale','aroman_bot_telegram')
")
[[ "$provider_login_state" == "f|f" ]] || {
  echo "Provider logins must remain disabled until their grants are applied" >&2
  exit 1
}

echo "=== EXERCISE LEGACY ROLE AND MEMBERSHIP RECONCILIATION ==="
docker exec "$container_name" psql -X -U postgres -d bot_test -v ON_ERROR_STOP=1 \
  -c "CREATE ROLE aroman_bot LOGIN PASSWORD 'synthetic_legacy_pw_16_14'; GRANT aroman_bot_telegram TO aroman_bot; GRANT aroman_bot TO aroman_bot_bale"

legacy_membership_count=$(docker exec "$container_name" psql -X -U postgres -d bot_test -Atc "
  SELECT count(*)
  FROM pg_auth_members m
  JOIN pg_roles granted ON granted.oid=m.roleid
  JOIN pg_roles member ON member.oid=m.member
  WHERE granted.rolname IN ('aroman_bot_telegram','aroman_bot_bale','aroman_bot')
     OR member.rolname IN ('aroman_bot_telegram','aroman_bot_bale','aroman_bot')
")
[[ "$legacy_membership_count" == "2" ]] || {
  echo "Legacy reconciliation scenario must begin with both synthetic memberships" >&2
  exit 1
}

docker exec -i "$container_name" psql -X -U postgres -d bot_test \
  --set ON_ERROR_STOP=1 --file - < "$repo_dir/db/production/reconcile-bot-roles.sql"

legacy_login=$(docker exec "$container_name" psql -X -U postgres -d bot_test -Atc \
  "SELECT rolcanlogin FROM pg_roles WHERE rolname='aroman_bot'")
[[ "$legacy_login" == "f" ]] || {
  echo "Legacy shared bot role was not disabled" >&2
  exit 1
}
membership_count=$(docker exec "$container_name" psql -X -U postgres -d bot_test -Atc "
  SELECT count(*)
  FROM pg_auth_members m
  JOIN pg_roles granted ON granted.oid=m.roleid
  JOIN pg_roles member ON member.oid=m.member
  WHERE granted.rolname IN ('aroman_bot_telegram','aroman_bot_bale','aroman_bot')
     OR member.rolname IN ('aroman_bot_telegram','aroman_bot_bale','aroman_bot')
")
[[ "$membership_count" == "0" ]] || {
  echo "Provider role memberships were not fully removed" >&2
  exit 1
}
provider_login_state=$(docker exec "$container_name" psql -X -U postgres -d bot_test -Atc "
  SELECT string_agg(CASE WHEN rolcanlogin THEN 't' ELSE 'f' END, '|' ORDER BY rolname)
  FROM pg_roles WHERE rolname IN ('aroman_bot_bale','aroman_bot_telegram')
")
[[ "$provider_login_state" == "f|f" ]] || {
  echo "Provider logins must remain disabled until their grants are applied" >&2
  exit 1
}

echo "=== VERIFY ROLE RECONCILIATION REFUSES OBJECT OWNERSHIP ==="
docker exec "$container_name" psql -X -U postgres -d bot_test -v ON_ERROR_STOP=1 \
  -c "CREATE TABLE public.synthetic_bot_owned_probe (id integer); ALTER TABLE public.synthetic_bot_owned_probe OWNER TO aroman_bot_telegram"
if docker exec -i "$container_name" psql -X -U postgres -d bot_test \
  --set ON_ERROR_STOP=1 --file - < "$repo_dir/db/production/reconcile-bot-roles.sql" >/dev/null 2>&1; then
  echo "Role reconciliation unexpectedly accepted a provider-owned database object" >&2
  exit 1
fi
provider_login_state=$(docker exec "$container_name" psql -X -U postgres -d bot_test -Atc "
  SELECT string_agg(CASE WHEN rolcanlogin THEN 't' ELSE 'f' END, '|' ORDER BY rolname)
  FROM pg_roles WHERE rolname IN ('aroman_bot_bale','aroman_bot_telegram')
")
[[ "$provider_login_state" == "f|f" ]] || {
  echo "Unsafe provider logins were not left disabled after ownership refusal" >&2
  exit 1
}
docker exec "$container_name" psql -X -U postgres -d bot_test -v ON_ERROR_STOP=1 \
  -c "ALTER TABLE public.synthetic_bot_owned_probe OWNER TO aroman_migrate_test; DROP TABLE public.synthetic_bot_owned_probe"
docker exec -i "$container_name" psql -X -U postgres -d bot_test \
  --set ON_ERROR_STOP=1 --file - < "$repo_dir/db/production/reconcile-bot-roles.sql"
provider_login_state=$(docker exec "$container_name" psql -X -U postgres -d bot_test -Atc "
  SELECT string_agg(CASE WHEN rolcanlogin THEN 't' ELSE 'f' END, '|' ORDER BY rolname)
  FROM pg_roles WHERE rolname IN ('aroman_bot_bale','aroman_bot_telegram')
")
[[ "$provider_login_state" == "f|f" ]] || {
  echo "Provider logins must remain disabled after ownership is corrected until grants commit" >&2
}

echo "=== APPLY WEBSITE RUNTIME FUNCTION GRANTS ==="
docker exec -i "$container_name" psql -X -U postgres -d bot_test \
  --set ON_ERROR_STOP=1 --set app_user=aroman_app --file - \
  < "$repo_dir/db/production/grant-runtime-privileges.sql"

echo "=== VERIFY BOT GRANTS REFUSE DISABLED RLS ==="
docker exec "$container_name" psql -X -U postgres -d bot_test -v ON_ERROR_STOP=1 \
  -c "ALTER TABLE public.scent_bot_sessions DISABLE ROW LEVEL SECURITY"
if docker exec -i "$container_name" psql -X -U postgres -d bot_test \
  --set ON_ERROR_STOP=1 --set database_name=bot_test --set bot_user=aroman_bot_telegram --file - \
  < "$repo_dir/db/production/grant-bot-privileges.sql" >/dev/null 2>&1; then
  echo "Bot grant script unexpectedly accepted a table with RLS disabled" >&2
  exit 1
fi
docker exec "$container_name" psql -X -U postgres -d bot_test -v ON_ERROR_STOP=1 \
  -c "ALTER TABLE public.scent_bot_sessions ENABLE ROW LEVEL SECURITY"

echo "=== APPLY LEAST-PRIVILEGE PROVIDER GRANTS ==="
for bot_user in aroman_bot_telegram aroman_bot_bale; do
  docker exec -i "$container_name" psql -X -U postgres -d bot_test \
    --set ON_ERROR_STOP=1 --set database_name=bot_test --set "bot_user=$bot_user" --file - \
    < "$repo_dir/db/production/grant-bot-privileges.sql"
  if [[ "$bot_user" == "aroman_bot_telegram" ]]; then
    provider_login_state=$(docker exec "$container_name" psql -X -U postgres -d bot_test -Atc "
      SELECT string_agg(CASE WHEN rolcanlogin THEN 't' ELSE 'f' END, '|' ORDER BY rolname)
      FROM pg_roles WHERE rolname IN ('aroman_bot_bale','aroman_bot_telegram')
    ")
    [[ "$provider_login_state" == "f|t" ]] || {
      echo "Telegram login should enable only after Telegram grants commit" >&2
      exit 1
    }
  fi
done
provider_login_state=$(docker exec "$container_name" psql -X -U postgres -d bot_test -Atc "
  SELECT string_agg(CASE WHEN rolcanlogin THEN 't' ELSE 'f' END, '|' ORDER BY rolname)
  FROM pg_roles WHERE rolname IN ('aroman_bot_bale','aroman_bot_telegram')
")
[[ "$provider_login_state" == "t|t" ]] || {
  echo "Both provider logins must be enabled after both grant transactions commit" >&2
  exit 1
}

echo "=== VERIFY TELEGRAM DATABASE PRIVILEGES ==="
(
  cd "$repo_dir"
  BOT_TEST_TELEGRAM_DATABASE_URL="$telegram_url" \
    node --no-warnings --test tests/scent-bot-db-privileges.test.mjs
)

echo "=== VERIFY TELEGRAM / BALE POSTGRESQL RELIABILITY ==="
(
  cd "$repo_dir"
  BOT_TEST_DATABASE_URL="$admin_url" \
  BOT_TEST_TELEGRAM_DATABASE_URL="$telegram_url" \
  BOT_TEST_BALE_DATABASE_URL="$bale_url" \
    node --no-warnings --test tests/scent-bot-postgres.integration.test.mjs
)

echo "PASS: isolated bot database role, RLS, grants and runtime integration checks"
