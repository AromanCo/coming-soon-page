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

Apply db/migrations/003_create_scent_bot_sessions.sql to your test database first.

## Private runtime variables
Never commit credentials:
- TELEGRAM_BOT_TOKEN (Telegram BotFather)
- BALE_BOT_TOKEN (Bale bot creation workflow)
- BOT_DATABASE_URL (or DATABASE_URL)
- BOT_PUBLIC_SITE_URL=https://aroman.ir
- BOT_MEDIA_BASE_URL=https://aroman.ir (optional; omit for text-only mode)
- DATABASE_SSL=true/false

## Launch
Run exactly one worker per provider, and confirm no webhook exists:

    node scripts/run-scent-companion.mjs telegram
    node scripts/run-scent-companion.mjs bale

No bot service is enabled by default; an opt-in Compose overlay is now available.
Test commands /start, /help, /privacy, /reset, /result and /forget in a private test chat.
Check seven answers, eight extra answers, old buttons, image fallback, links and opt-in behavior.

## Pre-production limits
- Test real Bale and Telegram API behavior separately; adapters use shared Bot API subset.
- Session write and message delivery are not atomic; delivery retries can show a later screen.
- Share link reveals only public archetype, not a personalized answer profile.
- No broadcasts or marketing subscription tracking.
- Update public privacy notice before real users and review retention/deletion obligations.
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

