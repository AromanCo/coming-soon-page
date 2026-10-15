#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

if (( $# != 2 )); then
  echo "Usage: $0 BACKUP.dump.gpg aroman_restore_TARGET" >&2
  exit 2
fi

backup_path=$1
target_database=$2
config_file=${AROMAN_BACKUP_CONFIG:-/etc/aroman/backup.env}

# shellcheck disable=SC1090
source "$config_file"
: "${AROMAN_APP_DIR:?Set AROMAN_APP_DIR}"
: "${AROMAN_ENV_FILE:?Set AROMAN_ENV_FILE}"
: "${AROMAN_BACKUP_PASSPHRASE_FILE:?Set AROMAN_BACKUP_PASSPHRASE_FILE}"

[[ -r "$backup_path" ]] || { echo "Backup is not readable" >&2; exit 1; }
[[ "$target_database" =~ ^aroman_restore_[a-zA-Z0-9_]+$ ]] || {
  echo "Refusing restore: target must begin with aroman_restore_" >&2
  exit 1
}

cd "$AROMAN_APP_DIR"

table_count=$(docker compose --env-file "$AROMAN_ENV_FILE" -f compose.prod.yaml exec -T db \
  sh -ec '
    export PGPASSWORD="$(cat /run/secrets/db_admin_password)"
    psql --username "$POSTGRES_USER" --dbname "$1" --tuples-only --no-align \
      --command "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('\''pg_catalog'\'', '\''information_schema'\'') AND c.relkind IN ('\''r'\'', '\''p'\'')"
  ' sh "$target_database")

if [[ "$table_count" != "0" ]]; then
  echo "Refusing restore: target database is not empty" >&2
  exit 1
fi

gpg \
  --batch \
  --quiet \
  --decrypt \
  --pinentry-mode loopback \
  --passphrase-file "$AROMAN_BACKUP_PASSPHRASE_FILE" \
  "$backup_path" | docker compose \
    --env-file "$AROMAN_ENV_FILE" \
    -f compose.prod.yaml \
    exec -T db sh -ec '
      export PGPASSWORD="$(cat /run/secrets/db_admin_password)"
      exec pg_restore --username "$POSTGRES_USER" --dbname "$1" --no-owner --no-privileges
    ' sh "$target_database"

echo "Restore completed into isolated database: $target_database"
