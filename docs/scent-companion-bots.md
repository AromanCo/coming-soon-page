# AROMAN Scent Companion - Telegram / Bale

Standalone opt-in polling workers; no bots run with the website.

## MVP
- 7 quick questions and optional 8 deeper questions, with shared website scoring and 900 catalog entries.
- Inline callback buttons, stale callback rejection, back, resume, reset and public result sharing.
- Private chats only; PostgreSQL session persistence, 30-day expiry, /forget deletion.
- No phone requirement or broadcasts.
- Photo delivery attempts with text fallback. Imagery is a scene per question, not unique collage per answer.

## Testing
Use Node 24.21+ and locked dependencies:

    npm ci
    node --no-warnings --experimental-strip-types --test tests/scent-companion.test.mjs
    npm test
    npm run build

Apply migrations `003_create_scent_bot_sessions.sql`,
`004_add_scent_bot_outbox.sql`, `006_bound_bot_delivery_retries.sql`,
`007_bounded_bot_control_queue_metrics.sql`, and
`008_isolate_bot_provider_rows.sql` to the
bot test database. The normal migration service applies them from `db/migrations`.

For the complete PostgreSQL provider-isolation check, run:

    bash scripts/test-bot-database-isolation.sh

The script starts a temporary PostgreSQL 16.15 container bound only to
`127.0.0.1`, uses synthetic credentials, exercises role reconciliation and
grant fail-closed behavior, runs the RLS/least-privilege/reliability suites,
and removes the container on exit. It does not use the website database or
production secrets. Docker, Python 3, Node 24+, and `npm ci` are required.

For individual database tests, use a disposable loopback PostgreSQL database
named `bot_test`. The RLS isolation test requires `BOT_TEST_DATABASE_URL` to
authenticate as a disposable PostgreSQL superuser. If the variable is absent,
the test skips; if it is explicitly set to a non-PostgreSQL, non-loopback, or
non-`bot_test` target, the test fails before connecting. It also verifies the
actual database and authenticated session role before changing the fixture.

    BOT_TEST_DATABASE_URL='postgres://test_admin:test_password@127.0.0.1:5432/bot_test' \
    node --no-warnings --test tests/scent-bot-rls.integration.test.mjs

The reliability integration additionally requires
`BOT_TEST_TELEGRAM_DATABASE_URL` and `BOT_TEST_BALE_DATABASE_URL`. All three
URLs must target the same loopback hostname, port, and `bot_test` database.
The provider URLs must authenticate specifically as `aroman_bot_telegram` and
`aroman_bot_bale`; the test checks the actual `session_user` identities before
applying migrations, reading queues, or delivering synthetic responses. If any
of the three variables is set but the configuration is incomplete or points
elsewhere, the test fails before opening a database connection.

The least-privilege check in `tests/scent-bot-db-privileges.test.mjs` uses
`BOT_TEST_TELEGRAM_DATABASE_URL` alone and enforces the same loopback,
database-name, and exact-login checks. Never point any of these variables at
production or another application database.

Use synthetic credentials for this isolated test database. Adapter tests use
mocked fetch responses and do not contact Telegram or Bale.

## Private runtime variables
Never commit credentials:
- TELEGRAM_BOT_TOKEN_FILE and BALE_BOT_TOKEN_FILE (mounted secret files)
- Provider database password files for `aroman_bot_telegram` and `aroman_bot_bale`
- BOT_PUBLIC_SITE_URL=https://aroman.ir
- BOT_MEDIA_BASE_URL=https://aroman.ir (optional; omit for text-only mode)
- DATABASE_SSL=true/false

## Launch
Run one worker per provider against the same PostgreSQL database, and confirm
no webhook exists:

    node scripts/run-scent-companion.mjs telegram
    node scripts/run-scent-companion.mjs bale

No bot service is enabled by default; an opt-in Compose overlay is available.
Test commands /start, /help, /privacy, /reset, /result and /forget in a private test chat.
Check seven answers, eight extra answers, old buttons, image fallback, links and opt-in behavior.

PostgreSQL holds a session advisory lock for each provider on the same pinned
connection used for transactions and outbox delivery. A second worker using the
same database fails at startup before contacting the provider. A normal SIGTERM
releases the lock; closing the PostgreSQL connection after a process crash
releases it as well. If the lock session is lost, the worker exits so the
supervisor can restart it and acquire a fresh lock. Restarting reloads the
committed offset and drains pending deliveries before polling for more updates.
The lock does not coordinate workers pointed at different databases.
The opt-in Compose workers allow 45 seconds for SIGTERM shutdown so the 20-second
long poll can finish and the lock can be released before forced termination.

For each polled update, eligible session changes, response enqueue, and the next
update offset commit in one transaction. Updates are sorted by the
provider update ID before processing; duplicate or already-passed IDs are ignored.
The worker polls before attempting a single delivery, so persistent send failures
do not prevent later commands, including `/forget`, from being processed. A
delivery failure gets a persisted retry time with exponential backoff (2 seconds
through a 15 minute cap), and one chat's earlier retry does not block eligible
responses for other chats. Responses preserve ID order within each chat. One
provider call can still delay the next poll up to its 40 second API timeout.

Delivery is bounded to 10 attempts per response. After the final failure, the
rendered response is discarded. Outbox capacity is 2,000 rows per provider and
20 rows per chat: 1,800 ordinary responses, 100 `/forget` confirmations, and 100
temporary-busy responses. At ordinary capacity, the incoming update ID commits
but its quiz state does not advance. A callback gets a best-effort busy alert;
commands may get a queued busy response if its bounded lane has room. The user
can retry the same answer/command. This avoids silently advancing quiz state
without its required response. `/forget` always deletes session and prior queued
responses in its transaction, even if its confirmation lane is full; confirmation
delivery is best effort and may be omitted. Duplicate control notices for one
chat coalesce. Aggregate omission, expiry, exhaustion and deletion-clear counts
are stored per provider without chat identifiers or message contents. Control
and ordinary lanes alternate when both are eligible, so priority does not
permanently starve quiz responses. These limits bound database and retry growth.
Pending messages also expire after 30 days.

Each selected row receives a two minute database lease before the provider call.
The lease survives process crashes; after it expires, a restarted worker can
retry the row. `/forget` atomically removes the chat's session and queued rows.
If a row was already claimed before `/forget` committed, that send may already
be in flight and cannot necessarily be recalled if the provider accepts it. No
earlier queued row can be selected after the deletion commits. Outbox rows
temporarily contain chat IDs and rendered responses, which may include
recommendations derived from quiz answers. Expired rows and exhausted rows are
purged on worker startup and delivery passes; if workers remain stopped, expired
data remains stored until a worker starts again.

Delivery is at-least-once. If Telegram or Bale accepts a message but the worker
loses the response or the database cannot record successful delivery, the worker
may send it again after the lease expires, including after `/forget` if the send
was already in flight. The providers do not participate in the PostgreSQL
transaction, so exactly-once delivery is not claimed. Media falls back to text
only when the provider explicitly rejects the photo; ambiguous network failures
stay queued for retry to avoid an immediate duplicate text. Logs suppress
exception details and contain no tokens, chat IDs, response contents, or request URLs.

## Pre-production limits
- Test real Bale and Telegram API behavior separately; adapters use shared Bot API subset.
- Mock tests do not establish live provider compatibility. Verify provider-specific API responses and private-chat behavior before release.
- Outbox retries can duplicate a message after an ambiguous provider response or failed outbox deletion; they preserve queued responses across worker crashes but do not create exactly-once delivery.
- Share link reveals only public archetype, not a personalized answer profile.
- No broadcasts or marketing subscription tracking.
- The website `/privacy` page and bot `/privacy` command disclose browser-only web quiz answers, bot chat/answer storage, 30-day session and pending-response expiry, Telegram/Bale processing, retry limits, `/forget` behavior, in-flight messages, and backup/provider deletion limits. Owner/legal review is still required before real users.
- Production release remains blocked until `NEXT_PUBLIC_PRIVACY_EMAIL` is configured with an owner-verified privacy contact. Do not substitute a test or guessed address. The page shows an explicit blocker while no valid address is configured.
- Do not merge or deploy until checks and manual QA pass.

## Docker Compose: local test with isolated bot services

Both Telegram and Bale run in Docker using one shared `Dockerfile.bot` image.
The bots are **opt-in**, so the normal website deployment is not changed.

Create a local, git-ignored `.env.bots` from `.env.bots.example`. Create
`secrets/bots/telegram_bot_token`, `bale_bot_token`, `db_telegram_bot_password`,
and `db_bale_bot_password` as separate files. The local stack also needs the
existing `.env` with PostgreSQL credentials. The opt-in setup service provisions
the bot logins and grants against the local database after migrations complete.

The local Compose overlay is `compose.bots.yaml` and must be used alongside `compose.yaml`:

    docker compose --env-file .env --env-file .env.bots -f compose.yaml -f compose.bots.yaml config --quiet
    docker compose --env-file .env --env-file .env.bots -f compose.yaml -f compose.bots.yaml --profile telegram build telegram-bot
    docker compose --env-file .env --env-file .env.bots -f compose.yaml -f compose.bots.yaml --profile telegram up -d db migrate telegram-bot

For Bale, replace `telegram` and `telegram-bot` with `bale` and `bale-bot`.
For both services, use `--profile bots` and select both workers explicitly.
Use `docker compose ... logs -f telegram-bot` to inspect the bot worker.

**Important:** Do NOT combine `compose.bots.yaml` with `compose.prod.yaml`.
The local bot overlay provisions provider logins only when an opt-in bot profile
is selected. Store Telegram and Bale tokens and database passwords in separate
files under `BOT_SECRETS_DIR`; each service mounts only its own files. The website
and waitlist services retain their existing database configuration.

`compose.prod.bots.yaml` is for the repository's standard production Compose
stack. It runs Bale only. The one-shot `bot-db-roles` service has its own
`provision-bot-roles` profile and is not a dependency of the Bale worker; an
ordinary worker start cannot silently reconcile database roles. Role
provisioning remains a separately authorized operator action. Reconciliation
first commits a lockdown phase: it removes memberships, disables provider and
legacy logins, and terminates their existing database sessions. It re-enables the
provider logins only in a second transaction after ownership checks pass. If a
provider or legacy role owns any database object, reconciliation aborts and the
provider logins remain disabled until ownership is corrected and reconciliation
is rerun. Run this operation in a maintenance window; supervised workers can
reconnect after successful provisioning. The service grants each provider login
`CONNECT`, schema `USAGE`, DML only on bot session, offset, outbox and metrics
tables, and `USAGE` on the shared outbox sequence. It grants no schema
`CREATE`, waitlist access, or broad default privileges.

For the existing Afra Compose stack, append `compose.afra.bale.yaml` after
Afra's host-managed files. It adds an internal `afra-bot-database` network to
the existing `db` and Bale containers, while Bale also joins `bot-egress`.
PostgreSQL is not attached to `bot-egress` and no database port is published.
Docker bridge networks do not enforce destination-level egress restrictions;
Afra's host firewall must permit only the required HTTPS destinations. This
Afra overlay contains no Telegram, migration, web, database, or role
provisioning worker service. Provision provider roles through a separately
approved administrative operation before enabling Bale.

Bot tokens and provider database passwords accept file-based configuration.
Direct local compatibility still accepts token environment variables,
`BOT_DATABASE_URL`, `DATABASE_URL`, and `BOT_DATABASE_PASSWORD`; production and
Compose workers use provider-specific password files. Mixing provider and shared
credentials, URL and `PGHOST`/`PGUSER`/`PGDATABASE` methods, or a value with its
`_FILE` variant fails closed. Secret contents are excluded from startup and API logs.

Migration 008 enables RLS on sessions, poll offsets, outbox and delivery metrics.
Policies bind `platform` to PostgreSQL `session_user` (`aroman_bot_telegram` or
`aroman_bot_bale`), so query parameters and writable custom settings cannot select
the other provider. Unknown roles fail closed. Role reconciliation commits a lockdown phase
that removes provider/legacy memberships, disables provider and old shared
`aroman_bot` logins, and terminates their existing sessions. A second transaction
re-enables provider logins only after confirming that neither provider nor legacy
role owns any database object. If ownership validation fails, provider logins stay
disabled until the ownership issue is corrected and reconciliation is rerun. The
grant script refuses runtime access unless both provider roles are non-elevated,
membership-free and non-owners and all four tables retain the expected
`session_user` policies; it first revokes existing database, schema, table,
sequence and routine privileges, then grants only the required bot-table
operations and outbox-sequence usage. Workers have no table ownership, schema
creation, `BYPASSRLS`, waitlist access, or direct routine execution privileges.

The migration role owns these tables and RLS is not forced so the trusted
migration owner can perform schema maintenance. PostgreSQL superusers and
administrators able to assume the migration role remain privileged boundaries.
Both workers use the shared outbox sequence;
sequence values and gaps, along with PostgreSQL relation statistics and sizes,
can reveal approximate combined activity. A worker with sequence `USAGE` can also
consume values. Advisory locks are global database primitives: a compromised
worker can deliberately take the other provider's known lock key and cause denial
of service, but cannot read its rows. The production overlay remains review-only
and profile gated; it is not deployed.

Do not combine `compose.prod.bots.yaml` with the local Compose stack. Do not
run its role-provisioning service against production without separate
authorization.

No ports are published by the workers. They contact the messaging APIs with outbound HTTPS.
Their processes run as the non-root Node user on a read-only filesystem.
They are not automatically started by `docker compose up` without bot profiles.

If your local Docker installation still fails with the `dockerme.ir` DNS registry-mirror
error, that DNS issue must be corrected independently; it is not a bot code issue.
Avoid `docker compose down -v`: it would delete PostgreSQL data.
