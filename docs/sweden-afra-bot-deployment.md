# Sweden and Afra bot topology

This document describes configuration only. It does not authorize deployment.
Sweden runs the Telegram worker alone. Afra keeps the existing website and
PostgreSQL stack and may run the Bale worker. Both provider workers must use
the same Afra database; Sweden must not run PostgreSQL, the website, Bale or
migrations.

For the operator-reported M5 live acceptance, image provenance, rollback and
the read-only M6 Afra preflight, see [M5 Telegram handoff and M6 Bale
readiness](m5-telegram-m6-bale-readiness.md).

## Compose files

- `compose.sweden.telegram.yaml` contains one Telegram worker. Supply
  `AFRA_PRIVATE_DB_HOST`, `AFRA_PRIVATE_DB_PORT`, `POSTGRES_DB`,
  `SCENT_BOT_IMAGE_TAG`, and `AROMAN_SECRETS_DIR` through an operator-owned
  environment file. Compose has no default database host or port. The worker
  uses `aroman_bot_telegram` and mounts only the Telegram token and Telegram
  database password files. It joins the pre-existing external Docker network
  `aroman-telegram`; Compose does not create that network or configure a
  tunnel. It has no published ports, runs read-only as the unprivileged image
  user, drops capabilities, and restarts under `unless-stopped` supervision.
  For the temporary Afra setup, `DATABASE_SSL` is explicitly false because
  PostgreSQL SSL is disabled; database traffic must use the encrypted SSH
  reverse tunnel.
- `compose.afra.bale.yaml` is appended after Afra's existing host-managed
  four-file Compose configuration. Bale joins the already-existing `backend`
  network for PostgreSQL access and a separate `bot-egress` bridge for provider
  API access. The overlay does not change the `db`, `web`, or `migrate` service
  definitions, so attaching Bale does not require a database restart. The DB
  remains off `bot-egress` and has no published port. Bale uses
  `aroman_bot_bale` and only Bale secret files. It defines no Telegram worker
  and cannot start Telegram polling.
- `compose.prod.bots.yaml` is for the repository's standard production stack,
  not a replacement for Afra's host-managed Compose files.

Compose config can be rendered without starting services, using synthetic
values and an operator-owned environment file. Do not put real secrets in
shell history or commit environment files. Compose secret file paths must be
readable by the Docker daemon; protect each provider token and database
password with restrictive host permissions and keep them in separate files.

The Afra Bale overlay deliberately shares the existing backend network with
the website and PostgreSQL for this temporary deployment. This lets the worker
reach the current database without changing or recreating the database
container, but it also means Docker networking does not isolate Bale from
other backend services. Provider-specific database roles, least-privilege
grants and `session_user` RLS remain mandatory. The separate `bot-egress`
network is not an outbound allowlist; verify Afra host firewall rules for
provider API destinations before starting Bale.

## Private Sweden to Afra database path

The operator must operate the host-managed SSH reverse tunnel and route. Choose
a stable private Afra database address and port and provide those values
through Sweden's configuration. The existing `aroman-telegram` external Docker
network must already connect the worker to the host-side tunnel endpoint;
Compose only attaches the worker to it. The Docker network does not create the
tunnel or connect Sweden to Afra by itself.

The private path must meet all of these controls before the Telegram worker is
started:

1. Establish authenticated tunnel peers and route only the needed Sweden to
   Afra database traffic. Keep tunnel keys and peer configuration outside the
   repository. Set host routing and forwarding explicitly; no Compose file
   installs a tunnel or changes host routes.
2. Configure PostgreSQL to listen on the selected private interface and add a
   narrowly scoped `pg_hba.conf` rule for the Sweden tunnel source, database,
   and `aroman_bot_telegram` role. Do not bind or publish PostgreSQL on a public
   interface. The Afra host and provider firewalls must allow TCP on the
   selected private database port only over the authorized private path.
3. Give the Sweden worker a verified route to that private address. Apply
   host/provider egress controls so the worker can reach the private database
   endpoint and Telegram HTTPS endpoints only as intended. A Docker bridge
   alone does not limit destination addresses.
4. Use a distinct database password for each provider. Keep row-level
   `session_user` policies and grants in place; do not give either worker the
   admin or migration role.
5. For the current temporary Afra deployment, PostgreSQL SSL is disabled and
   the Sweden overlay sets `DATABASE_SSL=false`. Use only the authenticated,
   encrypted SSH reverse tunnel for database traffic; do not route this
   connection directly over a public interface. If PostgreSQL TLS is enabled
   in a later deployment, change the overlay only after validating the
   certificate hostname and trust chain. When `DATABASE_SSL=true`, the worker
   verifies the certificate and rejects invalid identities.

If the private route or database fails, the worker retries polling/database
errors with bounded backoff. Loss of its pinned advisory-lock session causes
the worker to exit; the supervisor restarts it. On restart it reacquires its
provider lock, reloads the committed poll offset and drains pending deliveries.
At-least-once delivery means an ambiguous provider response can result in a
duplicate. The advisory lock only coordinates workers connected to the same
database; a second database would break the shared state and lock guarantee.

## Role and worker gates

Before either worker starts, an operator must verify on Afra that migrations
`003`, `004`, `006`, `007` and `008` are present and that provider roles,
passwords, grants and RLS policies are correct. This change does not run
migrations or role reconciliation. In the standard production overlay,
`bot-db-roles` is available only under the explicit `provision-bot-roles`
profile and is not a dependency of a worker. On Afra, use the existing
authorized administrative procedure for role provisioning; the Afra Bale
worker overlay has no privileged provisioning container.

Before enabling Bale, check the active Afra Compose project for an existing
Bale worker and confirm that no Bale webhook is enabled. The worker itself
fails startup if a webhook is configured and takes a PostgreSQL session lock
to prevent a second Bale worker on that database. Before enabling Telegram on
Sweden, check for an existing Telegram polling worker and webhook. Do not run
the standard production Telegram service on Afra; the target Afra overlay has
no Telegram service.

## Deployment sequence (operator runbook)

### Sweden Telegram

1. Record the approved source revision and build the `Dockerfile.bot` image.
2. Establish and independently verify the private route, firewall rules,
   PostgreSQL listener and authentication rules, and the chosen TLS policy.
3. Create the Sweden environment file with private endpoint, database name,
   port and image tag. Place only Telegram token and Telegram database
   password files in its protected secret directory.
4. Render the Compose configuration with synthetic values, inspect that it
   contains only `telegram-bot`, and check no existing Telegram worker or
   webhook conflict.
5. Under an approved deployment change, start only the Telegram worker and
   inspect its sanitized logs for lock acquisition and polling startup.

Rollback: stop the Telegram service and confirm its process exits; restore the
previous worker image/configuration. Do not change Afra database volumes or
disable private firewall controls. A stopped worker releases its advisory
lock; the database retains its committed offsets and pending deliveries.

### Afra Bale, website and database

1. Preserve Afra's existing Compose file order, image overrides, database
   compatibility override and project name. Append only
   `compose.afra.bale.yaml` for this worker configuration.
2. Verify the merged configuration leaves `db`, `web` and `migrate` identical
   to the existing four-file configuration, joins Bale to `backend` and
   `bot-egress`, and leaves `db` off `bot-egress`. Confirm the host firewall
   applies the required outbound destination policy.
3. Through the existing authorized change and backup process, verify database
   version/image, current migrations, provider roles and grants. Provision
   roles only as a separately approved step. No routine Bale restart should
   run role reconciliation.
4. Check for an existing Bale worker and webhook conflict. Render configuration
   with synthetic values. Under an approved deployment change, append the Bale
   overlay after Afra's four existing files and start only the explicitly
   selected worker, without starting its dependencies:

   ```sh
   docker compose --project-directory "$AFRA_CHECKOUT" \
     -f "$AFRA_CHECKOUT/compose.yaml" \
     -f "$AFRA_ECR_COMPOSE" \
     -f "$AFRA_NGINX_COMPOSE" \
     -f "$AFRA_DB_COMPAT_OVERRIDE" \
     -f "$AFRA_CHECKOUT/compose.afra.bale.yaml" \
     --profile bale up -d --no-deps --no-build --pull never bale-bot
   ```

   Use an already-present approved worker image. Do not run `up` for the whole
   project or for `db`, `web` or `migrate`. Verify Bale lock acquisition and
   worker startup using sanitized logs; verify the website independently.

Rollback: stop Bale, restore the previous Bale image and Compose configuration,
and leave the existing website, database volume and host-managed overrides in
place. Do not run `down -v`, remove database volumes, or reverse migrations as
part of worker rollback. Use only the separately approved database recovery
procedure if database recovery is needed.

## Existing-volume role SQL delivery proposal

The role SQL scripts expect their password files at `/run/secrets/*`. They can
receive those files through a short-lived PostgreSQL client container instead
of adding mounts or files to the running database container. This is a proposal
for a separately authorized role change; it has not been run against Afra.
First stage the expected files in a protected host directory and verify that
the local `postgres:16-alpine` client image is already present. Then invoke a
disposable client with read-only bind mounts for secrets and SQL, sharing only
the current DB container's network namespace:

```sh
docker run --rm --pull=never --user 0:0 \
  --network aroman-coming-soon_backend \
  --mount type=bind,source=/etc/aroman/secrets,target=/run/secrets,readonly \
  --mount type=bind,source="$RELEASE_CHECKOUT/db/production",target=/sql,readonly \
  postgres:16-alpine sh -ec '
    export PGHOST=db PGPORT=5432 PGDATABASE=aroman
    export PGPASSWORD="$(tr -d "\n" </run/secrets/db_admin_password)"
    psql -X -w -v ON_ERROR_STOP=1 \
      -v database_name=aroman -v admin_user=aroman \
      -v migration_user=aroman_migrate -v app_user=aroman_app \
      -U aroman --file /sql/create-roles.sql
  '
```

The script's own `\set` commands read the migration/app passwords from the
same read-only `/run/secrets` mount. Run `grant-runtime-privileges.sql` in a
separate disposable client using `db_migration_password` for its connection
and `-U aroman_migrate`; this ensures the `SECURITY DEFINER` functions are
owned by the restricted migration role. For bot setup, use a separate client
with the admin password to run `reconcile-bot-roles.sql`, then
`grant-bot-privileges.sql` once per provider. Do not put password contents in
arguments or logs. `--rm` removes each client; the command does not mount the
database volume or modify the running DB container. The admin secret must
preserve the current `aroman` password until the website cutover succeeds.

For the website cutover, Afra's existing base `compose.yaml` passes
`DATABASE_URL` from the project environment file. Set that value to the
`aroman_app` connection string and add
`DATABASE_USE_LEAST_PRIVILEGE_FUNCTIONS: "true"` under `web.environment` in an
already-included Afra override. Render the unchanged four-file order plus the
override with `docker compose config --quiet`; do not print resolved
configuration. Treat the environment file as a credential store: the November 9 Afra check confirmed mode `0600` for both the original
project `.env` and `/etc/aroman/production.env`. Reverify permissions
and the effective override before the production cutover.
Applying changed web environment requires an explicitly selected web update;
do not include database dependencies in that update.

## Operator decisions still required

- Private tunnel technology, peer management, endpoint naming/address,
  routing, key rotation and outage monitoring.
- PostgreSQL private bind address, tunnel source range, `pg_hba.conf` rule,
  firewall rules and whether PostgreSQL TLS is enabled; if enabled, the
  certificate hostname, trust chain (including a code change if it uses a
  private CA), and certificate rotation process.
- Exact Afra Compose file merge order and names of the existing web/database
  networks after all host overrides are applied.
- Destination-level outbound firewall policy for Telegram on Sweden and Bale
  on Afra. Compose's bridge networks alone cannot enforce an HTTPS allowlist.
- Approved role provisioning, backup/restore readiness, release image tag,
  secret ownership and log/monitoring access.
