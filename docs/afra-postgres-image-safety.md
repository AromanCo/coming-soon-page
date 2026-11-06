# Afra PostgreSQL deployment preflight

Afra's AROMAN deployment composes these four files in this order:

1. `compose.yaml` — base application and PostgreSQL services.
2. `compose.ecr.yaml` — Afra's ECR image configuration.
3. `compose.nginx.yaml` — Afra's Nginx ingress configuration.
4. `aroman-db-compat.override.yaml` — Afra's host-specific database compatibility override.

The three Afra-specific files are maintained on the VPS and are not included in
this repository. Later files override earlier Compose values. The preflight
requires all four files and checks the final merged configuration, so it catches
an override that changes only one of `db` or `migrate` as well as a missing
override.

## Existing PostgreSQL baseline and approved Compose reference

Afra production currently runs PostgreSQL 16.14. Its compatibility override
declares `postgres:16-alpine` for both `db` and `migrate`, with
`pull_policy: never`. The preflight therefore requires that exact image
reference for both services:

~~~text
postgres:16-alpine
~~~

The repository's standard production Compose stack pins a different PostgreSQL
image and is not Afra's effective stack. Do not use that image as a substitute
for the Afra compatibility override.

The `16-alpine` tag is mutable and does not prove an immutable image identity or
patch version. No verified PostgreSQL 16.14 registry digest or local image
provenance is available to this preflight, and none is invented here. The
preflight checks only the declared Compose image reference and `pull_policy`;
it does not inspect Afra's local image store, verify the cached image's
PostgreSQL patch version, or query the running server's version. `pull_policy:
never` and the deployment's `--pull never` prevent Compose from silently
replacing the local PostgreSQL image during this startup. They do not prove
which image was previously loaded or what version is currently running.

PostgreSQL 16.15 is explicitly rejected by this baseline. An image/version
upgrade requires a separate approval that changes the baseline in the
preflight, documents the exact approved reference and verification evidence,
and updates the regression tests. Do not change the production PostgreSQL
version as part of this safety correction.

## Operator procedure

The files live in separate directories on Afra. From the checkout, pass each
absolute path explicitly in the required order and keep the Compose project
directory set to the checkout root:

~~~sh
cd /root/dev/aroman/coming-soon-page
node scripts/afra-compose-preflight.mjs \
  --project-dir /root/dev/aroman/coming-soon-page \
  --compose-file /root/dev/aroman/coming-soon-page/compose.yaml \
  --compose-file /root/.config/aroman-inplace/compose.ecr.yaml \
  --compose-file /root/.config/aroman-inplace/compose.nginx.yaml \
  --compose-file /root/.config/server-maintenance/aroman-db-compat.override.yaml
~~~

The `--compose-file` arguments must be supplied exactly once each and in this
order. The script checks the requested paths exist, renders the configuration
with the checkout as `--project-directory`, and validates the merged services.
If deployment uses an explicit `--env-file`, pass that same path to the
preflight with `--env-file` as well. The preflight calls only
`docker compose config --format json`; it does not run migrations, pull images,
or modify containers. It fails closed if a file is missing, Compose cannot
render the merge, either service is absent, an image differs from the approved
`postgres:16-alpine` reference, or either pull policy is not `never`. Passing
this check does not establish the local image's contents or the running
database version.

After a successful preflight and normal deployment approval, use the same
ordered file list, environment file and project directory for the deployment
command, with pulls disabled:

~~~sh
docker compose --project-directory /root/dev/aroman/coming-soon-page \
  -f /root/dev/aroman/coming-soon-page/compose.yaml \
  -f /root/.config/aroman-inplace/compose.ecr.yaml \
  -f /root/.config/aroman-inplace/compose.nginx.yaml \
  -f /root/.config/server-maintenance/aroman-db-compat.override.yaml \
  up -d --pull never
~~~

If deployment uses an explicit `--env-file`, add the same option and path to
both commands. Do not remove either the per-service `pull_policy: never`
requirement or `--pull never` from the deployment invocation. This document
and preflight are safety checks; they do not authorize or perform a deployment.
