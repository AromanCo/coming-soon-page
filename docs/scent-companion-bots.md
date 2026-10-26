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

No service is automatically enabled by Docker Compose.
Test commands /start, /help, /privacy, /reset, /result and /forget in a private test chat.
Check seven answers, eight extra answers, old buttons, image fallback, links and opt-in behavior.

## Pre-production limits
- Test real Bale and Telegram API behavior separately; adapters use shared Bot API subset.
- Session write and message delivery are not atomic; delivery retries can show a later screen.
- Share link reveals only public archetype, not a personalized answer profile.
- No broadcasts or marketing subscription tracking.
- Update public privacy notice before real users and review retention/deletion obligations.
- Do not merge or deploy until checks and manual QA pass.
