#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

config_file=${AROMAN_BACKUP_CONFIG:-/etc/aroman/backup.env}
if [[ ! -r "$config_file" ]]; then
  echo "Backup configuration is not readable: $config_file" >&2
  exit 1
fi

# This file is administrator-controlled (root:root 0600) and may define only
# the documented AROMAN_BACKUP_* paths and settings.
# shellcheck disable=SC1090
source "$config_file"

: "${AROMAN_APP_DIR:?Set AROMAN_APP_DIR}"
: "${AROMAN_ENV_FILE:?Set AROMAN_ENV_FILE}"
: "${AROMAN_BACKUP_DIR:?Set AROMAN_BACKUP_DIR}"
: "${AROMAN_BACKUP_PASSPHRASE_FILE:?Set AROMAN_BACKUP_PASSPHRASE_FILE}"
: "${AROMAN_BACKUP_RETENTION_DAYS:=30}"
: "${AROMAN_BACKUP_REMOTE:=}"

if [[ ! "$AROMAN_BACKUP_RETENTION_DAYS" =~ ^[1-9][0-9]*$ ]]; then
  echo "AROMAN_BACKUP_RETENTION_DAYS must be a positive integer" >&2
  exit 1
fi
if [[ ! -s "$AROMAN_BACKUP_PASSPHRASE_FILE" ]]; then
  echo "Backup encryption passphrase file is missing or empty" >&2
  exit 1
fi

mkdir -p "$AROMAN_BACKUP_DIR"
chmod 0700 "$AROMAN_BACKUP_DIR"
exec 9>"$AROMAN_BACKUP_DIR/.backup.lock"
flock -n 9 || {
  echo "Another AROMAN backup is already running" >&2
  exit 1
}

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
final_path="$AROMAN_BACKUP_DIR/aroman-postgres-$timestamp.dump.gpg"
partial_path="$final_path.partial"

on_exit() {
  status=$?
  rm -f -- "$partial_path"
  if (( status == 0 )); then
    logger -t aroman-backup "PostgreSQL backup completed successfully"
  else
    logger -t aroman-backup "PostgreSQL backup failed with status $status"
  fi
}
trap on_exit EXIT

cd "$AROMAN_APP_DIR"
docker compose --env-file "$AROMAN_ENV_FILE" -f compose.prod.yaml exec -T db \
  sh -ec '
    export PGPASSWORD="$(cat /run/secrets/db_migration_password)"
    exec pg_dump \
      --username "$POSTGRES_MIGRATION_USER" \
      --dbname "$POSTGRES_DB" \
      --format=custom \
      --compress=6 \
      --no-owner \
      --no-privileges
  ' | gpg \
    --batch \
    --yes \
    --symmetric \
    --cipher-algo AES256 \
    --pinentry-mode loopback \
    --passphrase-file "$AROMAN_BACKUP_PASSPHRASE_FILE" \
    --output "$partial_path"

gpg \
  --batch \
  --quiet \
  --decrypt \
  --pinentry-mode loopback \
  --passphrase-file "$AROMAN_BACKUP_PASSPHRASE_FILE" \
  --output /dev/null \
  "$partial_path"

mv -- "$partial_path" "$final_path"

if [[ -n "$AROMAN_BACKUP_REMOTE" ]]; then
  command -v rclone >/dev/null || {
    echo "AROMAN_BACKUP_REMOTE is set but rclone is not installed" >&2
    exit 1
  }
  rclone copyto "$final_path" "${AROMAN_BACKUP_REMOTE%/}/$(basename "$final_path")"
fi

find "$AROMAN_BACKUP_DIR" \
  -maxdepth 1 \
  -type f \
  -name 'aroman-postgres-*.dump.gpg' \
  -mtime "+$AROMAN_BACKUP_RETENTION_DAYS" \
  -delete
