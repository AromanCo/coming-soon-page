#!/bin/sh
set -eu

compose_file=${COMPOSE_PROD_FILE:-compose.prod.yaml}
env_file=${AROMAN_ENV_FILE:-/etc/aroman/production.env}

if [ ! -r "$env_file" ]; then
  echo "Production environment file is not readable: $env_file" >&2
  exit 1
fi

docker compose --env-file "$env_file" -f "$compose_file" exec -T db \
  /opt/aroman/db-admin/create-roles.sh

echo "Database roles reconciled without dropping data. Run the migrate service next."
