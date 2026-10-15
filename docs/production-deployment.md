# AROMAN single-VPS production runbook

This runbook targets one Ubuntu 24.04 LTS VPS running Docker Engine, Docker
Compose, Caddy, the standalone Next.js application, and PostgreSQL 16. It does
not authorize a deployment. Every command in the deployment section requires
an operator to confirm the VPS, DNS, backups, and credentials first.

## Architecture and trust boundary

~~~text
Internet
   │ TCP 80/443, optional UDP 443 (HTTP/3)
   ▼
Caddy 2.11.4 ───────── ingress network ───────── Next.js :3000
   │  public ports only                              │
   │  TLS, body/header limits,                       │ database network
   │  canonical client IP                            ▼
   │                                           PostgreSQL 16.11
   │                                           (no host port)
   └── persistent caddy_data/config                  ▲
                                                     │
                              one-shot migrate ──────┘
                                  persistent postgres_data
~~~

Caddy is the first HTTP peer reached by public clients. There is no CDN or
load balancer in front of it. It derives `X-Aroman-Client-IP` from
`{remote_host}`, overwrites incoming `X-Aroman-Client-IP`, `X-Forwarded-For`,
and `X-Real-IP`, and removes `Forwarded`. The application accepts only the
canonical header when `CLIENT_IP_MODE=caddy`; a missing, comma-separated, or
syntactically invalid IP is rejected. The origin has no published port, so an
Internet client cannot provide the trusted header directly.

NAT can legitimately group many users under one IPv4 address, so a shared
network can reach the five-attempt limit. IPv6 clients are keyed by their
complete address; privacy-address rotation can weaken per-IP controls. The IP
is HMACed before database storage, but remains personal/security metadata and
must receive the same retention care as registrations. If a CDN or load
balancer is added, do not simply enable Caddy `trusted_proxies` for all private
ranges. Record its exact egress ranges and header contract, configure strict
trusted ranges, and rerun spoofing tests before release.

The official Caddy build has no built-in request-rate directive. This stack
keeps PostgreSQL-backed application limiting active and applies header, body,
and timeout limits at ingress. If volumetric abuse later requires an ingress
limiter, first prefer the VPS/provider firewall or a reviewed external edge.
A custom Caddy module requires a separately built and patched image; Caddy
lists community modules but explicitly does not endorse or maintain them, so
none is silently introduced here.

## Files and configuration

- `compose.prod.yaml`: production-only network and service topology.
- `compose.prod.local.yaml`: loopback HTTP override for local simulation.
- `deploy/caddy/Caddyfile`: HTTPS proxy and canonical IP policy.
- `.env.production.example`: non-secret settings template.
- `deploy/secrets/README.md`: secret file contract.
- `db/production/`: role provisioning and runtime grants.
- `scripts/backup-postgres.sh`: encrypted, retained, optionally off-site dump.
- `scripts/restore-postgres-backup.sh`: guarded restore into an empty test DB.
- `scripts/verify-latest-backup.sh`: isolated restore test with cleanup.

`NEXT_PUBLIC_*` values are embedded in browser assets by `next build`. Changing
the canonical URL, social links, or privacy address therefore requires an
image rebuild. Database passwords and `WAITLIST_HASH_SECRET` are runtime-only
secret files and must never be build arguments or `NEXT_PUBLIC_*` values.

No CPU or memory limits are committed because the VPS capacity is unknown.
Before deployment, measure available RAM/CPU and reserve memory for the kernel,
PostgreSQL, and Caddy; then test any Compose limits under build and signup load.
PID limits should likewise be based on observed Next.js/PostgreSQL process use.

## PostgreSQL identities and existing data

The bootstrap role (`aroman_admin`) owns the database and is used only for
role administration and disaster recovery. `aroman_migrate` owns the `public`
schema and its objects, runs SQL migrations, and is not a superuser and cannot
create roles or databases. `aroman_app` can connect, use the schema, and execute
only two fixed-purpose functions for registration and rate limiting. It has no
direct table or sequence privileges. It cannot read phone numbers, delete
registrations, create schema objects, create databases, create roles, or become
superuser.

For a fresh volume, PostgreSQL runs `create-roles.sh` once during initialization.
Docker initialization scripts do not rerun for an existing volume. For an
existing database, start only `db`, run the explicit provisioning script, then
run migrations. Provisioning updates role credentials and transfers existing
public tables/sequences/views to the migration owner in place. It does not drop
tables, truncate data, reset identities, recreate the database, or remove a
volume.

For an existing volume, set `POSTGRES_ADMIN_USER` to that volume's current
bootstrap/database-owner role before starting it. A volume created by the
existing `compose.yaml` normally uses `aroman`; setting `aroman_admin` does not
create or rename a role because init scripts do not rerun. The reconciliation
script rotates the selected bootstrap role's password to `db_admin_password`.
Confirm the owner from a backup or the existing stack before proceeding.

Always snapshot/backup an existing production database before changing roles.
Verify independently:

~~~sh
docker compose --env-file /etc/aroman/production.env -f compose.prod.yaml exec -T db \
  psql -U aroman_admin -d aroman -c "\du aroman_app"
docker compose --env-file /etc/aroman/production.env -f compose.prod.yaml exec -T db \
  psql -U aroman_admin -d aroman -c "\du aroman_migrate"
~~~

## Ubuntu host preparation

Use a currently supported Ubuntu 24.04 LTS image and apply all updates. Install
Docker Engine and the Compose plugin from Docker's official apt repository, not
an unreviewed convenience script. Follow Docker's current Ubuntu instructions:
<https://docs.docker.com/engine/install/ubuntu/>.

1. Create a named, non-root administrative account with `sudo`.
2. Install its SSH public key and confirm a second, independent SSH session can
   log in and use `sudo`.
3. Only after that test succeeds, place a reviewed snippet in
   `/etc/ssh/sshd_config.d/`, validate with `sudo sshd -t`, reload SSH, and test
   another new session before closing the original. Do not disable password or
   root login first; that can lock out the administrator.
4. Restrict SSH at the VPS-provider firewall to known administrative source
   ranges where possible. Allow TCP 80/443 and, if retaining HTTP/3, UDP 443.
5. Configure the host firewall consistently. Docker-published ports can bypass
   ordinary UFW expectations; enforce policy in the provider firewall and the
   `DOCKER-USER` chain. This Compose file publishes only Caddy.
6. Treat membership in the `docker` group as root-equivalent. Give Docker
   access only to trusted administrators, or evaluate Docker rootless mode and
   retest low-port and volume behavior.
7. Keep Ubuntu security updates enabled with `unattended-upgrades`. Review
   `/var/log/unattended-upgrades` and plan for service restarts/reboots.
8. Configure provider alerts (or a monitored agent) for disk usage, inode use,
   memory pressure, load, container health, and ports 80/443. Alert on failed
   `aroman-backup*` units and stale off-server backups.

Compose uses Docker's rotating `local` logging driver. Review `journalctl`,
`docker compose logs`, certificate renewal, PostgreSQL health, and disk growth.
Never log request bodies or full phone numbers.

## Secrets and directory setup

Example paths:

~~~sh
sudo install -d -m 0750 -o root -g root /etc/aroman /etc/aroman/secrets
sudo install -m 0600 -o root -g root .env.production.example /etc/aroman/production.env
sudo sh -c 'openssl rand -base64 36 > /etc/aroman/secrets/db_admin_password'
sudo sh -c 'openssl rand -base64 36 > /etc/aroman/secrets/db_migration_password'
sudo sh -c 'openssl rand -base64 36 > /etc/aroman/secrets/db_app_password'
sudo sh -c 'openssl rand -hex 32 > /etc/aroman/secrets/waitlist_hash_secret'
sudo chown root:root /etc/aroman/secrets/db_admin_password /etc/aroman/secrets/db_migration_password
sudo chmod 0400 /etc/aroman/secrets/db_admin_password /etc/aroman/secrets/db_migration_password
sudo chown 1000:1000 /etc/aroman/secrets/db_app_password /etc/aroman/secrets/waitlist_hash_secret
sudo chmod 0400 /etc/aroman/secrets/db_app_password /etc/aroman/secrets/waitlist_hash_secret
~~~

Edit the environment file with the real domain, canonical HTTPS URL, privacy
contact, release image tag (normally the reviewed Git SHA), and official social
links. Do not print resolved Compose configuration into CI or support logs.

## Pre-deployment validation

These commands are local and do not contact a production server:

~~~sh
npm ci
npm test
npm run build
npm audit
docker run --rm -e AROMAN_DOMAIN=http://localhost \
  -v "$PWD/deploy/caddy/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2.11.4-alpine@sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
npm run test:production
~~~

The production simulation is plain HTTP on `127.0.0.1:8080`; it deliberately
does not claim publicly trusted HTTPS. It preserves its named PostgreSQL volume
and never runs `docker compose down -v`.

## Deployment commands (require explicit operator approval)

Do not run this section until DNS, credentials, a backup, monitoring, and a
rollback image have been verified.

~~~sh
cd /opt/aroman/app
docker compose --env-file /etc/aroman/production.env -f compose.prod.yaml config --quiet
docker compose --env-file /etc/aroman/production.env -f compose.prod.yaml build web
docker compose --env-file /etc/aroman/production.env -f compose.prod.yaml up -d --wait db
AROMAN_ENV_FILE=/etc/aroman/production.env ./scripts/provision-production-db-roles.sh
docker compose --env-file /etc/aroman/production.env -f compose.prod.yaml run --rm migrate
docker compose --env-file /etc/aroman/production.env -f compose.prod.yaml up -d --no-build
docker compose --env-file /etc/aroman/production.env -f compose.prod.yaml ps
~~~

Never use `down -v`. For rollback, keep the previous Git checkout and image tag,
restore its non-secret environment compatibility, and run `up -d --no-build`.
Database migrations in this repository are additive; do not reverse them or
restore an older database automatically. If a data restore is required, stop
writes, preserve the failed database, and follow an approved recovery plan.

## Backup and recovery

Install GnuPG, `flock` (util-linux), and optionally rclone from trusted Ubuntu
packages. Copy `deploy/backup/backup.env.example` to `/etc/aroman/backup.env`,
create a long independent passphrase at `/etc/aroman/backup-passphrase`, set
both files to root:root `0600`, and configure an encrypted/off-server rclone
destination if available. Restrict provider credentials to the backup prefix.

Install the four systemd units/timers from `deploy/systemd/`, run
`systemctl daemon-reload`, enable both timers, and manually run each service
once. The daily backup creates a PostgreSQL custom-format dump, encrypts it with
AES-256 through GnuPG, validates decryption, optionally copies it off-server,
and applies configurable local retention. The named Docker volume is not a
backup.

The monthly verification decrypts the newest backup into a uniquely named,
isolated `aroman_restore_verify_*` database, checks required tables, prints no
phone values, and drops only that verification database. Monitor failures:

~~~sh
systemctl list-timers 'aroman-backup*'
journalctl -u aroman-backup.service -u aroman-backup-verify.service
~~~

For a manual restore, first create a new empty database whose name starts with
`aroman_restore_`, then run the guarded script. It refuses the production name
and any non-empty target. Promote restored data only through a separate,
reviewed incident procedure.

## Release-readiness checklist

- DNS A record points to this VPS; publish AAAA only after IPv6 firewall and
  routing are verified.
- Domain ownership and inbound TCP 80/443 permit ACME issuance and renewal.
- HTTPS certificate issuance and HTTP-to-HTTPS `308` redirects are observed on
  the real domain; local simulation does not prove this.
- Caddy is the first proxy; no CDN/load balancer has been inserted.
- `web` and `db` show no host port; forged-header tests pass through Caddy.
- `NEXT_PUBLIC_SITE_URL` exactly matches the production HTTPS origin.
- Open Graph preview, official logo, favicon, artwork, social URLs, and privacy
  contact are approved.
- Independent admin/migration/runtime credentials are installed and role tests
  pass; the application role cannot read phone numbers or run DDL.
- An encrypted off-server backup and an isolated restore verification succeed.
- `npm audit`, official Next.js advisories, container image scan, tests, and
  production build are current for the release date.
- Caddy, web, database, and backup health/failure alerts reach an operator.
- Disk-space and certificate-expiry monitoring is active.
- Previous application image/config are retained and rollback is rehearsed.
- Smoke checks pass. A write test uses only an operator-designated synthetic
  phone: `AROMAN_BASE_URL=https://example.com ./scripts/production-smoke-test.sh`.

## Current upstream references

- Next.js 16.4.1 security release:
  <https://github.com/vercel/next.js/releases/tag/v16.4.1>
- Caddy automatic HTTPS: <https://caddyserver.com/docs/automatic-https>
- Caddy reverse-proxy headers:
  <https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#headers>
- Docker Ubuntu install/firewall warning:
  <https://docs.docker.com/engine/install/ubuntu/>
- Docker group privilege warning:
  <https://docs.docker.com/engine/install/linux-postinstall/>
- PostgreSQL privileges: <https://www.postgresql.org/docs/16/sql-grant.html>
- Ubuntu automatic updates:
  <https://ubuntu.com/server/docs/how-to/software/automatic-updates/>
