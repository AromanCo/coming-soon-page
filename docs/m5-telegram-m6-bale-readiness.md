# M5 Telegram handoff and M6 Bale readiness

**Status date: 2026-11-10.** The M5 handoff reports that Telegram is running
on Sweden and live `/start`, Scent Quest and `/forget` acceptance passed. This
is operator-provided status. No VPS, worker container, network, secret or
database was inspected for this local task. M6 Bale remains a plan; this
document does not authorize production changes.

## M5 source and image provenance

The reviewed source revision is
`6c99b9a446bf6654f8062234d045c0420607ef76`. It contains the Sweden-only
Telegram Compose service, the Scent Companion polling runner and the shared
Telegram/Bale worker code. The running image ID, registry digest, build log,
source label, and exact build context are not available from this handoff. A
source commit alone does not prove which image is running. Record those values
from the service owner’s read-only deployment evidence before describing the
live artifact as reproducible.

The worker Dockerfile now uses a dedicated runtime manifest at
`deploy/bot-runtime/package.json` and its lockfile. That manifest contains
only `pg@8.23.1`; npm records exact transitive versions, registry URLs and
integrity hashes. Both image stages use the official Node.js
`24.21.0-alpine3.23` multi-platform image pinned to manifest digest
`sha256:9ec4a2e289874ed0d722e1772ec2de45d2801541db8612f3638b26f128c69ac2`.
The build asserts Node.js `v24.21.0` and `pg` `8.23.1`, copies only worker
source and required Scent Quest data, runs as the unprivileged `node` user,
and labels the image with the source revision supplied as
`BOT_SOURCE_REVISION`. The Sweden and Afra Compose overlays pass that build
argument from `SCENT_BOT_SOURCE_REVISION`.

For a future approved build, use an immutable source commit and unique image
tag, then retain the build output, image ID/digest, revision label and SBOM or
dependency inventory together. The value passed to
`SCENT_BOT_SOURCE_REVISION` must be the exact commit used as the build context;
do not label a modified working tree with its parent commit. The running M5
image has not been rebuilt or replaced by this task. The official Node base
tag and digest can be checked at the [Node Docker Official Image tags](https://hub.docker.com/_/node/tags?name=24.21.0-alpine3.23).

For a future approved build, use the approved checkout and retain the resolved
commit, image ID/digest, revision label and SBOM or dependency inventory
together. The build argument must match the exact commit used as the build
context; do not label a modified working tree with its parent commit. For
example:

```sh
export SCENT_BOT_SOURCE_REVISION="$(git rev-parse HEAD)"
export SCENT_BOT_IMAGE_TAG="rev-${SCENT_BOT_SOURCE_REVISION}"
docker buildx build --load \
  --build-arg "BOT_SOURCE_REVISION=${SCENT_BOT_SOURCE_REVISION}" \
  --tag "aroman-scent-companion:${SCENT_BOT_IMAGE_TAG}" \
  --file Dockerfile.bot .
docker image inspect "aroman-scent-companion:${SCENT_BOT_IMAGE_TAG}" \
  --format '{{.Id}} {{.Size}} {{index .Config.Labels "org.opencontainers.image.revision"}}'
```

The Compose build arg must receive the same
`SCENT_BOT_SOURCE_REVISION`. Retain the final immutable registry digest after
publishing the approved artifact; a local image ID is not a registry digest.

## Offline image delivery workflow

When the repository-private gate passes,
`.github/workflows/m6-offline-image-delivery.yml` builds the approved
`3b7438c7f68adbbe93f9e04a98a49b814d8d9bfe` source on GitHub-hosted
`ubuntu-24.04`. Its trigger is a `push` to
`work/m5-handoff-m6-bale-readiness-20261110` when the workflow, Dockerfile,
worker manifest/lockfile, or runtime inputs change. It checks out the approved
source SHA explicitly even though the workflow itself is on a newer review
branch commit. It does not publish to a container registry and has no
production credentials. It uploads a compressed Docker archive, SHA-256 sidecar
and provenance text as the seven-day artifact
`aroman-scent-companion-3b7438c7f68adbbe93f9e04a98a49b814d8d9bfe-m6slim`.
GitHub currently reports this repository as **public**. The workflow therefore
stops at its first step and does not build or upload until the repository is
private. This guard is necessary because workflow artifacts are downloadable
by repository readers; in a public repository that includes anyone. No
visibility setting was changed. A private repository or a separately approved
restricted artifact destination is required to receive the image safely.

The workflow deliberately does not declare `workflow_dispatch`: GitHub only
accepts manual-dispatch events for workflow files present on the default
branch ([workflow trigger rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)).
A branch-filtered `push` lets this workflow run from the review branch without
changing `main` first. Artifact readers must have repository read access
([GitHub artifact access](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts)).

### Afra import and non-executing verification procedure

After separate approval and transfer by the authorized operator, verify the
archive on Afra without starting a container or changing Compose:

```sh
sha256sum --check \
  aroman-scent-companion-3b7438c7f68adbbe93f9e04a98a49b814d8d9bfe-m6slim.tar.gz.sha256
docker load --input \
  aroman-scent-companion-3b7438c7f68adbbe93f9e04a98a49b814d8d9bfe-m6slim.tar.gz
docker image inspect \
  aroman-scent-companion:3b7438c7f68adbbe93f9e04a98a49b814d8d9bfe-m6slim \
  --format '{{.Id}} {{.Os}}/{{.Architecture}} {{.Config.User}} {{index .Config.Labels "org.opencontainers.image.revision"}}'
```

Compare the image ID with the artifact provenance file; require `linux/amd64`,
user `node`, and the exact approved revision. The GitHub workflow already
checked Node, `pg`, and offline module imports in an isolated no-network test
container. Do not run `docker run`, `docker create`, or Compose on Afra for this
verification. `docker load` adds only an image to the local image store; it
does not recreate the database/website or start Bale. Confirm the Afra
architecture before transfer; this artifact is built for `linux/amd64`.

## M5 operational record and rollback

Acceptance reported by the handoff:

- Telegram runs on Sweden; Bale, website and PostgreSQL do not run there.
- Live `/start`, Scent Quest and `/forget` passed.

For the deployment record, capture the worker container ID, restart count,
image ID/digest and revision label; confirm `aroman_bot_telegram` is the
configured database identity; check sanitized startup logs for lock and
polling state; and verify database connectivity through the private tunnel.
Do not print rendered environment, tokens, database passwords, chat IDs,
answers or live waitlist records. Operational evidence should describe
success/failure and counts only.

If a future Telegram image/configuration change needs rollback, record the
last known-good immutable image tag and digest, Compose revision, environment
file revision and tunnel/network identity before the change. Under a separate
approved deployment change, stop only `telegram-bot`, restore the known-good
tag/configuration, and recreate only that service with dependencies disabled,
build disabled and pulls disabled. Confirm the prior image digest and lock
reacquisition. Do not stop the database, alter the shared database, remove
volumes or delete the network as part of worker rollback. A stopped worker
releases its advisory lock; PostgreSQL retains committed offsets and pending
outbox rows.

The Sweden overlay declares `aroman-telegram` as an **external** Docker
network. Compose requires that network to exist and does not create, own or
restore it. The network is a local bridge, not the Sweden-to-Afra route. The
host-managed tunnel service and its endpoint attachment must survive daemon and
host restarts; `restart: unless-stopped` on the worker does not make an
unavailable tunnel healthy. Manual network removal or Docker network pruning
can also break the worker. Verify the network owner, tunnel service enablement,
restart behavior and route after reboot. Those checks were not made here.

## M6 Afra Bale plan — read-only preflight first

The Afra overlay is opt-in and defines only `bale-bot`. It attaches the worker
to the existing `backend` network for PostgreSQL and the separate `bot-egress`
network for Bale API access. Sharing `backend` is accepted for this temporary
architecture; it is not service-level network isolation. The database remains
off `bot-egress`, and no database port or Bale port is published. PostgreSQL
SSL is disabled on Afra, so keep the connection inside the existing backend
network and set `DATABASE_SSL=false`. Database role restrictions and
`session_user`-based RLS are mandatory; Docker bridge membership is not an
outbound firewall. Afra host/provider firewall policy for Bale API egress must
be verified.

### Read-only readiness checks

Before any separately approved activation, an Afra operator should record:

1. **Topology and identity:** exact four Compose files and order; project name;
   current `db`, `web` and `migrate` container IDs, image IDs and restart
   counts; PostgreSQL 16.14 and the existing volume; no published database
   port; existing `backend` network identity and membership. Render the four
   files plus `compose.afra.bale.yaml` and compare `db`, `web` and `migrate`
   to the four-file baseline. The local deployment test already asserts those
   service definitions are identical.
2. **Capacity:** `df -h`, `df -i`, `free -h`, `docker system df`, current
   container memory use/limits and disk space for the approved image. Compare
   against operator-defined reserve thresholds and database/web headroom.
   Do not prune or delete images, containers, networks or volumes to make
   room. Afra capacity was not inspected in this task.
3. **Image:** verify the exact worker image exists locally on Afra without
   pulling. Check its ID/digest, source revision label, Node/pg provenance and
   size against the approved artifact record. Do not build on Afra as part of
   the worker activation.
4. **Credentials:** verify, without opening their contents, that separate
   Bale token and `db_bale_bot_password` files exist at the Compose-resolved
   paths, are regular non-symlink files, have the approved owner and
   restrictive permissions (normally `0600`), and are readable by Docker.
   Never put credentials in Compose environment values, shell history,
   command arguments or logs. Use the dedicated `aroman_bot_bale` login and a
   unique password; do not reuse Telegram, Website, bootstrap or migration
   credentials.
5. **Database gates:** read-only checks must confirm migrations and all four
   bot tables are present; `aroman_bot_bale` is `NOINHERIT`, non-elevated,
   owns no objects, has no memberships, and has only its approved bot-table
   grants; provider RLS policies use `session_user`; Bale cannot read Website
   waitlist data; and no competing Bale worker or webhook exists. M5 Telegram
   acceptance does not prove Bale credentials or provider grants.
6. **Privacy and egress:** verify the public and bot `/privacy` disclosures
   cover Bale processing, the 30-day session/outbox limits, `/forget`,
   provider-side retention and the limits for in-flight messages and backups.
   Use an internal test account only. Check Afra host/provider egress controls
   for the intended Bale API endpoints; `bot-egress` by itself is not an
   allowlist. Confirm no real chat content, answers, tokens or passwords are
   written to logs.

### Activation and acceptance, only after separate approval

Use the exact Afra four-file order, append only the Bale overlay, and select
only `bale-bot`. Reuse the accepted M5 image only if its ID/digest and source
revision prove it includes the reviewed Bale worker code; otherwise transfer a
separately approved image artifact to Afra. Never build or pull it on Afra.
The activation command, if separately authorized, is:

```sh
docker compose --project-directory "$AFRA_CHECKOUT" \
  -f "$AFRA_CHECKOUT/compose.yaml" \
  -f "$AFRA_ECR_COMPOSE" \
  -f "$AFRA_NGINX_COMPOSE" \
  -f "$AFRA_DB_COMPAT_OVERRIDE" \
  -f "$AFRA_CHECKOUT/compose.afra.bale.yaml" \
  --profile bale up -d --no-deps --no-build --pull never bale-bot
```

Do not run that command as part of this handoff. Never run the full project or
include `db`, `web` or `migrate`.

Accept M6 only when all of these are evidenced:

- Only `bale-bot` was created/updated; DB and Website container IDs, image IDs,
  restart counts, volume and PostgreSQL version are unchanged.
- Bale logs show startup and successful lock acquisition without private
  content; the session authenticates as `aroman_bot_bale`.
- Internal `/start`, Scent Quest progression and `/forget` pass; Bale can
  access its own rows and cannot read Telegram rows or Website waitlist data.
- Website health remains normal; database remains private on `backend`; Bale
  API egress is verified; no migration or provisioning service ran.
- Privacy and security reviewers accept the user-facing disclosure and the
  2–3 month temporary data-handling/retirement plan.

### Current M6 blockers

- Afra disk, inode and RAM headroom and the actual worker image presence/digest
  have not been read-only checked.
- The effective five-file Compose render, `backend`/`bot-egress` membership,
  host egress policy and absence of Bale webhook/worker conflict have not been
  inspected on Afra.
- Bale token/password presence, ownership and permissions have not been
  checked; Bale API credential readiness is unknown.
- Production Bale grants, provider RLS and `session_user` behavior have not
  been verified for the existing database.
- The live M5 image digest and Sweden tunnel/network boot persistence remain
  unknown. The local Dockerfile/lock change is isolated and is not yet an
  approved production artifact.
- M6 requires a separately approved change after the read-only preflight.
