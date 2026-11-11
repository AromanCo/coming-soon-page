# UX-02: optional provider-specific Mini App launcher (disabled)

**Status: code-only release preparation.** Neither this document nor a merge grants permission to deploy either worker, configure a new domain, or change a real bot's menu/profile. The live Bale worker remains on UX-01; Telegram remains on its previously approved image.

## How the launcher works

A single `BOT_MINIAPP_URL` environment variable is passed only to its provider worker via the approved Compose overlay. Its default is the empty string; with that default, **the native chat quiz, welcome buttons, database operations and existing deployment behavior are unchanged**.

Once a live HTTPS route is approved and tested, a provider can be configured, for example:

- Bale: `BOT_MINIAPP_URL=https://aroman.ir/scent-quest/mini?provider=bale`
- Telegram: `BOT_MINIAPP_URL=https://aroman.ir/scent-quest/mini?provider=telegram`

The worker rejects invalid schemes, credentials, fragments, nonstandard ports, paths outside `/scent-quest/mini`, non-AROMAN hosts and mismatched provider parameters. All such startup failures use non-reflective messages (URL is not logged). The URL comes from operator configuration, never user input.

On `/start`, when enabled, the first inline keyboard row becomes `✨ تجربه تصویری کشف رایحه` with provider-native `web_app: {url}`. The original `شروع کشف رایحه ✨` callback and `درباره آرومان` link stay available. The result/quiz logic, database, outbox, scoring, RLS, auth, `/forget`, /privacy, waitlist disabled state and worker advisory locks remain unchanged.

Bale's official documentation supports `InlineKeyboardButton.web_app`: https://docs.bale.ai/miniapp. Telegram supports inline `web_app` in private chats: https://core.telegram.org/bots/webapps. The actual client support still requires user acceptance in both apps.

## Important limitations

- UX-02 visual Mini App lives in **draft PR #34**. Its route is **not deployed**, so keep `BOT_MINIAPP_URL` empty until the exact approved HTTPS origin serves it.
- The Mini App is currently a **stateless browser quiz**, not a continuation of the bot's persisted session. Client-side results do not automatically appear in chat or PostgreSQL. Do not tell users their current quiz progress will be shared.
- `?provider=` is a presentation hint, **not** verified platform identity. If future server-side actions are needed, first implement separate authoritative Telegram/Bale signed `initData` validation; never use `initDataUnsafe` as auth.
- BotFather/management Main Mini App or menu configuration is **not** changed by this PR. An opt-in inline button is used because it allows retaining the existing native chat quiz for fallback.
- No new migrations, network, token, host, DNS, proxy or new-worker changes.

## Deployment gates

1. User approves the **actual** visual screenshot set in PR #34, including no third-party branding in welcome assets.
2. Stage and inspect the exact preview revision on approved HTTPS without touching the production website or waitlist.
3. Verify Bale and Telegram inline `web_app` support, Back, sharing and fallback against the real owner-controlled bots, one at a time.
4. Prepare an immutable image from approved merged commits with provenance and independent old-image rollback. Recheck Afra/Sweden disk, secrets and advisory locks before any restart.
5. No `BOT_MINIAPP_URL` activation until exact origin, provider route and rollout approval are recorded.

**No production action performed by this PR.**
