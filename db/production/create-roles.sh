#!/bin/sh
set -eu

: "${POSTGRES_DB:=aroman}"
: "${POSTGRES_USER:=aroman_admin}"
: "${POSTGRES_MIGRATION_USER:=aroman_migrate}"
: "${POSTGRES_APP_USER:=aroman_app}"

for secret_file in \
  /run/secrets/db_admin_password \
  /run/secrets/db_migration_password \
  /run/secrets/db_app_password; do
  if [ ! -s "$secret_file" ]; then
    echo "Required database role secret is missing or empty: $secret_file" >&2
    exit 1
  fi
done

psql \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set ON_ERROR_STOP=1 \
  --set database_name="$POSTGRES_DB" \
  --set admin_user="$POSTGRES_USER" \
  --set migration_user="$POSTGRES_MIGRATION_USER" \
  --set app_user="$POSTGRES_APP_USER" \
  --file /opt/aroman/db-admin/create-roles.sql
