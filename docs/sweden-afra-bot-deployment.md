# Sweden and Afra bot topology

This document describes configuration only. It does not authorize deployment.
Sweden runs the Telegram worker alone. Afra keeps the existing website and
PostgreSQL stack and may run the Bale worker. Both provider workers must use
the same Afra database; Sweden must not run PostgreSQL, the website, Bale or
migrations.

## Compose files

- `compose.sweden.telegram.yaml` contains one Telegram worker. Supply
  `AFRA_PRIVATE_DB_HOST`, `AFRA_PRIVATE_DB_PORT`, `POSTGRES_DB`,
  `SCENT_BOT_IMAGE_TAG`, and `AROMAN_SECRETS_DIR` through an operator-owned
  environment file. Compose has no default database host or port. The worker
  uses `aroman_bot_telegram` and mounts only the Telegram token and Telegram
  database password files. It has no published ports, runs read-only as the
  unprivileged image user, drops capabilities, and restarts under
  `unless-stopped` supervision. Its bridge network provides outbound routing;
  it does not create or configure a tunnel.
- `compose.afra.bale.yaml` is appended after Afra's existing host-managed
  Compose files. It adds an internal network to the existing `db` service and
  Bale worker, and a separate bridge egress network to Bale. The existing
  database remains off the egress network and has no published port. The
  worker uses `aroman_bot_bale` and only Bale secret files. It defines no
  Telegram worker and cannot start Telegram polling.
- `compose.prod.bots.yaml` is for the repository's standard production stack,
  not a replacement for Afra's host-managed Compose files.

Compose config can be rendered without starting services, using synthetic
values and an operator-owned environment file. Do not put real secrets in
shell history or commit environment files. Compose secret file paths must be
readable by the Docker daemon; protect each provider token and database
password with restrictive host permissions and keep them in separate files.

## Private Sweden to Afra database path

The operator must select and operate the private network or tunnel. Choose a
stable private Afra database address and port and provide those values through
Sweden's configuration; this repository assumes no IP, DNS name, tunnel
product, or public endpoint. Docker internal networks only connect containers
attached to that Docker network. They do not connect Sweden to Afra.

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
5. Prefer PostgreSQL TLS with a certificate valid for the configured database
   hostname and a chain trusted by the worker's Node.js trust store. When
   `DATABASE_SSL=true`, the worker verifies the certificate and rejects
   invalid identities. Never set a bypass of certificate verification. If
   Afra uses a private CA that is not in Node.js's trust store, add and review
   an explicit CA-file configuration before enabling TLS. The private tunnel
   should still be authenticated and encrypted if database TLS is not enabled.

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
2. Verify the merged configuration preserves existing web/database settings,
   joins `db` and Bale to the internal bot database network, and attaches only
   Bale to the egress network. Confirm the host firewall applies the required
   outbound destination policy.
3. Through the existing authorized change and backup process, verify database
   version/image, current migrations, provider roles and grants. Provision
   roles only as a separately approved step. No routine Bale restart should
   run role reconciliation.
4. Check for an existing Bale worker and webhook conflict. Render configuration
   with synthetic values, then start only the Bale profile. Verify lock
   acquisition and worker startup using sanitized logs; verify the website
   independently.

Rollback: stop Bale, restore the previous Bale image and Compose configuration,
and leave the existing website, database volume and host-managed overrides in
place. Do not run `down -v`, remove database volumes, or reverse migrations as
part of worker rollback. Use only the separately approved database recovery
procedure if database recovery is needed.

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
