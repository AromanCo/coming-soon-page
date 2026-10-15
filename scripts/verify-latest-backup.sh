#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

config_file=${AROMAN_BACKUP_CONFIG:-/etc/aroman/backup.env}
# shellcheck disable=SC1090
source "$config_file"
: "${AROMAN_APP_DIR:?Set AROMAN_APP_DIR}"
: "${AROMAN_ENV_FILE:?Set AROMAN_ENV_FILE}"
: "${AROMAN_BACKUP_DIR:?Set AROMAN_BACKUP_DIR}"
: "${AROMAN_BACKUP_PASSPHRASE_FILE:?Set AROMAN_BACKUP_PASSPHRASE_FILE}"

backup_path=$(find "$AROMAN_BACKUP_DIR" -maxdepth 1 -type f \
  -name 'aroman-postgres-*.dump.gpg' -printf '%T@ %p\n' | sort -nr | head -n1 | cut -d' ' -f2-)
[[ -n "$backup_path" ]] || { echo "No encrypted backup found" >&2; exit 1; }

target_database="aroman_restore_verify_$(date -u +%Y%m%d%H%M%S)_$$"
created=0

cleanup() {
  status=$?
  if (( created == 1 )); then
    cd "$AROMAN_APP_DIR"
    docker compose --env-file "$AROMAN_ENV_FILE" -f compose.prod.yaml exec -T db \
      sh -ec '
        export PGPASSWORD="$(cat /run/secrets/db_admin_password)"
        dropdb --username "$POSTGRES_USER" --if-exists --force "$1"
      ' sh "$target_database" >/dev/null || true
  fi
  if (( status == 0 )); then
    logger -t aroman-backup-verify "Encrypted PostgreSQL restore verification succeeded"
  else
    logger -t aroman-backup-verify "Encrypted PostgreSQL restore verification failed with status $status"
  fi
}
trap cleanup EXIT

cd "$AROMAN_APP_DIR"
docker compose --env-file "$AROMAN_ENV_FILE" -f compose.prod.yaml exec -T db \
  sh -ec '
    export PGPASSWORD="$(cat /run/secrets/db_admin_password)"
    createdb --username "$POSTGRES_USER" --template template0 "$1"
  ' sh "$target_database"
created=1

AROMAN_BACKUP_CONFIG="$config_file" \
  "$AROMAN_APP_DIR/scripts/restore-postgres-backup.sh" "$backup_path" "$target_database"

result=$(docker compose --env-file "$AROMAN_ENV_FILE" -f compose.prod.yaml exec -T db \
  sh -ec '
    export PGPASSWORD="$(cat /run/secrets/db_admin_password)"
    psql --username "$POSTGRES_USER" --dbname "$1" --tuples-only --no-align \
      --command "SELECT (to_regclass('\''public.waitlist_subscriptions'\'') IS NOT NULL AND to_regclass('\''public.waitlist_rate_limits'\'') IS NOT NULL)::text"
  ' sh "$target_database")

[[ "$result" == "true" ]] || {
  echo "Restore verification failed: expected waitlist schema is absent" >&2
  exit 1
}

echo "Restore verification succeeded; no phone values were printed."
