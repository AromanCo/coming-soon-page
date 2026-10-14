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

4. Apply the database migration:

   ~~~sh
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
     -f db/migrations/001_create_waitlist.sql
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

- Server-side normalization and email validation
- Explicit required marketing consent
- Persistent PostgreSQL storage
- Duplicate detection with a database unique constraint
- Five attempts per hashed network identifier per ten-minute window
- Honeypot field for simple bot filtering
- Loading, success, duplicate, rate-limit, unavailable, and network-error states

The current schema already preserves `created_at`, `consented_at`, and a
monotonic identity `id`. Those fields are sufficient to select future
early-access cohorts in registration order without changing signup behavior.
No invitation-management system is included in this release.

### Future early-access invitation operations

Implement invitations as a separate, authenticated administrative workflow.
Use a migration to add explicit invitation status and audit fields rather than
overloading signup or consent data. Select cohorts deterministically by
`created_at` and `id`, record who initiated each invitation batch, and make
retries idempotent. Invitation links should use short-lived, single-purpose
tokens stored as hashes, and email delivery credentials must remain in a
server-side secret manager. Do not expose cohort selection or email delivery
through a public route, and retain unsubscribe/deletion handling throughout the
invitation lifecycle.

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
db/migrations/           Idempotent database schema
public/images/           Replaceable campaign artwork
Dockerfile               Multi-stage standalone production image
compose.yaml             Web, database, and one-shot migration services
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
- A reverse proxy/platform that supplies x-forwarded-for or x-real-ip for per-client abuse limiting.
- The official AROMAN logo, favicon, social URLs, privacy contact, canonical URL, and final approved campaign image.
- A review of the current Next.js security release immediately before deployment. On 2026-10-14, 16.4.0 was the registry's latest stable release, while the Next.js team had announced an out-of-band security update for the same date that was not yet published.

## Asset replacement

public/images/aroman-hero.png is original generated campaign artwork and contains no logo or text. Replace it with approved brand photography when available while keeping a portrait crop.

The hexagonal emblem and AROMAN text in brand-mark.tsx and icon.svg are clearly temporary code-based presentations based only on the supplied hexagonal reference direction. They are not a replacement for the official brand master. Swap them for official clean SVG/PNG variants without changing their proportions.

## License and template provenance

The original repository was distributed under GPL-3.0 and included a generic coming-soon template. The implementation has been substantially rewritten, but the existing LICENSE is intentionally preserved.

For distributed copies of this covered work, GPL-3.0 generally requires preserving copyright and license notices, providing the corresponding source under GPL-3.0, marking modifications, and not adding restrictions that conflict with the license. Running the software only as a hosted service does not by itself trigger source distribution under GPL-3.0 (unlike AGPL), though distributing builds or copies can. This summary is operational guidance, not legal advice; obtain counsel before relicensing or combining this code with incompatible proprietary code.
