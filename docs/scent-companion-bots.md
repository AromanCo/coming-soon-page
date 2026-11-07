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

Apply migrations `003_create_scent_bot_sessions.sql` and
`004_add_scent_bot_outbox.sql` to the bot test database. The normal migration
service applies both from `db/migrations`.

To run the PostgreSQL reliability suite, use a disposable loopback PostgreSQL
database named `bot_test` and set `BOT_TEST_DATABASE_URL`. The test refuses a
different host or database name. It must never point at production.

    BOT_TEST_DATABASE_URL='postgres://test_user:test_password@127.0.0.1:5432/bot_test' npm test

Use synthetic credentials for this isolated test database. Adapter tests use
mocked fetch responses and do not contact Telegram or Bale.

## Private runtime variables
Never commit credentials:
- TELEGRAM_BOT_TOKEN (Telegram BotFather)
- BALE_BOT_TOKEN (Bale bot creation workflow)
- BOT_DATABASE_URL (or DATABASE_URL)
- BOT_PUBLIC_SITE_URL=https://aroman.ir
- BOT_MEDIA_BASE_URL=https://aroman.ir (optional; omit for text-only mode)
- DATABASE_SSL=true/false

## Launch
Run one worker per provider against the same PostgreSQL database, and confirm
no webhook exists:

    node scripts/run-scent-companion.mjs telegram
    node scripts/run-scent-companion.mjs bale

No bot service is enabled by default; an opt-in Compose overlay is now available.
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

For each polled update, session changes, a queued response, and the next update
offset commit in one transaction. Duplicate update IDs are ignored. A delivery
failure leaves the response queued; retries happen before more updates are
polled. This preserves delivery order and prevents an unbounded backlog, but it
also delays later commands, including `/forget`, while the oldest provider
delivery keeps failing. `/forget` removes the session and any queued response
for that chat in the same transaction once its update is processed, then queues
its confirmation. Pending messages expire after 30 days. Outbox rows temporarily contain the chat ID and rendered
response, which may include recommendations derived from quiz answers; rows are
deleted after delivery or `/forget`. Expired rows are ignored and purged on the
next worker delivery/prune pass; if all workers stay stopped, their expired
rows remain stored until a worker starts again.

Delivery is at-least-once. If Telegram or Bale accepts a message but the worker
loses the response, or the database cannot record successful delivery, the
worker may send it again after restart. The providers do not participate in the
PostgreSQL transaction, so exactly-once delivery is not claimed. Media falls
back to text only when the provider explicitly rejects the photo; ambiguous
network failures stay queued for retry to avoid an immediate duplicate text.
Logs suppress exception details so tokens, chat IDs, and answer data are not
written during polling failures.

## Pre-production limits
- Test real Bale and Telegram API behavior separately; adapters use shared Bot API subset.
- Mock tests do not establish live provider compatibility. Verify provider-specific API responses and private-chat behavior before release.
- Outbox retries can duplicate a message after an ambiguous provider response or failed outbox deletion; they preserve queued responses across worker crashes but do not create exactly-once delivery.
- Share link reveals only public archetype, not a personalized answer profile.
- No broadcasts or marketing subscription tracking.
- Update public privacy notice before real users and review retention/deletion obligations, including the temporary delivery outbox.
- Do not merge or deploy until checks and manual QA pass.

## Docker Compose: local test with isolated bot services

Both Telegram and Bale run in Docker using one shared `Dockerfile.bot` image.
The bots are **opt-in**, so the normal website deployment is not changed.

Create a local, git-ignored `.env.bots` from `.env.bots.example`. Keep your real bot tokens there. The local stack also needs the existing `.env` with PostgreSQL credentials.

The local Compose overlay is `compose.bots.yaml` and must be used alongside `compose.yaml`:

    docker compose --env-file .env --env-file .env.bots -f compose.yaml -f compose.bots.yaml config --quiet
    docker compose --env-file .env --env-file .env.bots -f compose.yaml -f compose.bots.yaml --profile telegram build telegram-bot
    docker compose --env-file .env --env-file .env.bots -f compose.yaml -f compose.bots.yaml --profile telegram up -d db migrate telegram-bot

For Bale, replace `telegram` and `telegram-bot` with `bale` and `bale-bot`.
For both services, use `--profile bots` and select both workers explicitly.
Use `docker compose ... logs -f telegram-bot` to inspect the bot worker.

**Important:** Do NOT combine `compose.bots.yaml` with `compose.prod.yaml`.
The production PostgreSQL roles deliberately restrict direct table reads and writes.
Before adding production workers, implement and review a dedicated least-privilege bot
database role, mounted secret files, and a production-only Compose overlay. This
local overlay must not be used on the VPS.

No ports are published by the workers. They contact the messaging APIs with outbound HTTPS.
Their processes run as the non-root Node user on a read-only filesystem.
They are not automatically started by `docker compose up` without bot profiles.

If your local Docker installation still fails with the `dockerme.ir` DNS registry-mirror
error, that DNS issue must be corrected independently; it is not a bot code issue.
Avoid `docker compose down -v`: it would delete PostgreSQL data.

