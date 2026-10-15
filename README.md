# AROMAN coming-soon website

A mobile-first Persian landing page for AROMAN, built with Next.js, React, Tailwind CSS, TypeScript, and PostgreSQL.

## Requirements

- Node.js 24 LTS (24.21.0 is pinned by this repository)
- npm 11+
- PostgreSQL 14+

Docker users only need Docker Engine with the Compose plugin; the Compose stack
provides Node.js 24.21.0 and PostgreSQL 16.

## Local development

1. Select the repository's Node version:

   ~~~sh
   nvm use
   ~~~

2. Install the exact dependency graph:

   ~~~sh
   npm ci
   ~~~

3. Copy .env.example to .env.local and fill in the required values.

4. Apply the database migrations in filename order:

   ~~~sh
   for migration in db/migrations/*.sql; do
     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"
   done
   ~~~

5. Start the app:

   ~~~sh
   npm run dev
   ~~~

Without both DATABASE_URL and WAITLIST_HASH_SECRET, the UI deliberately shows that signup is unavailable and disables submission. It never displays a fabricated success.

## Docker Compose

Copy the example environment and replace every placeholder secret:

~~~sh
cp .env.example .env
~~~

Keep POSTGRES_PASSWORD synchronized with the password in DATABASE_URL. Within
Compose, DATABASE_URL must use db as its hostname, not localhost. If the
password contains URL-reserved characters, percent-encode it in DATABASE_URL.

Build and start the complete production-like stack:

~~~sh
docker compose config
docker compose build
docker compose up -d
docker compose ps
~~~

The stack starts PostgreSQL, waits for it to become healthy, applies every SQL
file in db/migrations in filename order, and only then starts the standalone
Next.js server. PostgreSQL is not published to the host. WEB_PORT controls the
host port used by the web service.

Useful lifecycle commands:

~~~sh
# Follow application and database logs
docker compose logs -f web db migrate

# Re-run all idempotent migrations
docker compose run --rm migrate

# Restart the application without touching PostgreSQL data
docker compose restart web

# Rebuild after source changes
docker compose up -d --build

# Stop containers while preserving the named database volume
docker compose down
~~~

Do not use docker compose down -v unless permanent database deletion is
explicitly intended. The postgres_data named volume persists subscriptions and
rate-limit state across ordinary stops, starts, and container recreation.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| NEXT_PUBLIC_SITE_URL | Production | Canonical site URL used by SEO metadata and sitemap |
| DATABASE_URL | Waitlist | Server-only PostgreSQL connection string |
| DATABASE_SSL | Provider-dependent | Set to true when PostgreSQL requires TLS |
| DATABASE_SSL_REJECT_UNAUTHORIZED | Provider-dependent | Keep true; set false only when the provider explicitly requires it |
| WAITLIST_HASH_SECRET | Waitlist | Long random secret used to HMAC network identifiers for abuse prevention |
| NEXT_PUBLIC_INSTAGRAM_URL | Optional | Official Instagram URL; hidden when empty |
| NEXT_PUBLIC_LINKEDIN_URL | Optional | Official LinkedIn URL; hidden when empty |
| NEXT_PUBLIC_PRIVACY_EMAIL | Production | Public address for data access/deletion requests |
| WEB_PORT | Docker | Configurable host port mapped to container port 3000 |
| POSTGRES_USER | Docker | PostgreSQL role initialized by the database container |
| POSTGRES_PASSWORD | Docker | PostgreSQL role password; must match DATABASE_URL |
| POSTGRES_DB | Docker | PostgreSQL database initialized by the database container |

Generate the hash secret with openssl rand -hex 32. Never expose DATABASE_URL or WAITLIST_HASH_SECRET as NEXT_PUBLIC variables.

## Waitlist behavior

- Server-side Iranian mobile validation for local, `+98`, and `0098` formats
- Persian, Arabic, and English digit normalization to canonical E.164 storage
- Explicit required marketing consent
- Persistent PostgreSQL storage
- Duplicate detection with a partial unique index on canonical phone numbers
- Preservation of legacy email-only registrations
- Five attempts per hashed network identifier per ten-minute window
- Honeypot field for simple bot filtering
- A 4 KiB request-body limit and required JSON media type on the public endpoint
- `Cache-Control: no-store` on every waitlist response
- Loading, accepted, rate-limit, unavailable, and network-error states

New phone registrations are stored without an email address. Phone ownership
is not verified in this release because no OTP flow or SMS provider is active.
The schema preserves `created_at`, `consented_at`, `source`, security metadata,
and the monotonic identity `id`; existing email rows remain valid.

The public endpoint returns the same `202 Accepted` status and response body for
new and duplicate valid numbers. PostgreSQL still prevents duplicate rows, and
a repeated submission does not update the original consent or registration
timestamps. This removes the direct duplicate-status signal. Small timing
differences at the database and network layers may still be observable, so the
persistent IP rate limit remains necessary and the endpoint never echoes the
submitted number.

### Trusted proxy requirement

Production uses `CLIENT_IP_MODE=caddy` and accepts only a single valid
`X-Aroman-Client-IP` value. The production Caddy proxy overwrites that header
from its direct peer address and sanitizes `X-Forwarded-For`, `X-Real-IP`, and
`Forwarded`; neither the Next.js nor PostgreSQL container has a published host
port. Missing or malformed canonical identities fail closed.

The development Compose file explicitly enables a spoofable forwarded-header
compatibility mode for local integration tests. Never enable
`ALLOW_INSECURE_CLIENT_IP_HEADERS` in production. If a CDN or load balancer is
introduced, re-design and re-test the trusted-hop configuration before release.

The reverse proxy or hosting edge should also enforce coarse request-rate,
connection, header-size, body-size, and timeout limits before traffic reaches
Next.js. Terminate TLS there and set HSTS only on the HTTPS production host.

### Future OTP, SMS, and invitation operations

No SMS is sent by the current application. A later implementation should:

1. Integrate an approved Iranian SMS provider through a server-only adapter,
   with credentials held in a secret manager and delivery logs free of full
   phone numbers.
2. Generate cryptographically random, single-purpose OTPs; store only hashes;
   and expire them after a short configured window.
3. Add per-number and per-network verification-attempt and resend limits on top
   of the existing signup rate limit.
4. Add explicit verification state and timestamps through a new migration.
   Never infer ownership from successful storage or SMS delivery alone.
5. Make resend and provider retry operations idempotent, with bounded retries
   and auditable provider message identifiers.
6. Build SMS invitation cohorts as a separate authenticated administrative
   workflow. Select cohorts deterministically using `created_at` and `id`,
   record the operator and batch, and do not expose cohort operations publicly.
7. Add durable opt-out and unsubscribe handling before promotional SMS is sent,
   and ensure deletion requests are honored across provider and application
   records.

The rate-limit table is intentionally persistent across server instances. Periodically remove old buckets:

~~~sql
DELETE FROM waitlist_rate_limits
WHERE window_start < NOW() - INTERVAL '7 days';
~~~

## Project structure

~~~text
src/app/
  api/health/route.ts    Database-aware container health endpoint
  api/waitlist/route.ts  Server-side signup endpoint
  privacy/page.tsx       Persian privacy information
  layout.tsx             RTL document shell and SEO metadata
  page.tsx               Landing page
src/components/
  brand-mark.tsx         Temporary brand asset presentation
  site-footer.tsx        Configured social/privacy links
  waitlist-form.tsx      Accessible client form
src/lib/waitlist.ts      PostgreSQL and anti-abuse logic
src/lib/iranian-mobile.ts Iranian mobile normalization and validation
db/migrations/           Idempotent database schema
tests/                   Unit and Docker-backed integration tests
public/images/           Replaceable campaign artwork
Dockerfile               Multi-stage standalone production image
compose.yaml             Web, database, and one-shot migration services
compose.prod.yaml        Caddy and isolated production service topology
docs/production-deployment.md  VPS, backup, recovery, and release runbook
~~~

## Validation

~~~sh
npm run typecheck
npm run lint
npm test
npm run build
npm audit
~~~

## Deployment prerequisites

- A Node.js 24 runtime capable of running a Next.js server; this project is not a static export because the waitlist API is server-side.
- A reachable PostgreSQL database with the migration applied.
- All required environment variables set in the deployment platform.
- The production Caddy trust boundary (or an equivalently reviewed canonical client-IP contract) for per-client abuse limiting.
- The official AROMAN logo, favicon, social URLs, privacy contact, canonical URL, and final approved campaign image.
- A review of the current Next.js security release immediately before deployment. The repository currently pins the patched stable release 16.4.1.

The VPS production architecture and commands are documented in
`docs/production-deployment.md`. They are not an instruction to deploy without
explicit approval.

## Asset replacement

public/images/aroman-hero.png is original generated campaign artwork and contains no logo or text. Replace it with approved brand photography when available while keeping a portrait crop.

The hexagonal emblem and AROMAN text in brand-mark.tsx and icon.svg are clearly temporary code-based presentations based only on the supplied hexagonal reference direction. They are not a replacement for the official brand master. Swap them for official clean SVG/PNG variants without changing their proportions.

## License and template provenance

The original repository was distributed under GPL-3.0 and included a generic coming-soon template. The implementation has been substantially rewritten, but the existing LICENSE is intentionally preserved.

For distributed copies of this covered work, GPL-3.0 generally requires preserving copyright and license notices, providing the corresponding source under GPL-3.0, marking modifications, and not adding restrictions that conflict with the license. Running the software only as a hosted service does not by itself trigger source distribution under GPL-3.0 (unlike AGPL), though distributing builds or copies can. This summary is operational guidance, not legal advice; obtain counsel before relicensing or combining this code with incompatible proprietary code.
