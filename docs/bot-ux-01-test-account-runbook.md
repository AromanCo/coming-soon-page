# AROMAN Bot UX-01 — real-provider smoke test runbook

**Scope:** Test-account validation for Telegram and Bale before releasing UI changes. This runbook is **not** permission to touch existing production tokens, webhooks, PostgreSQL, workers or website.

## Source and approved design package

- Source under review: PR #31, `feat/bot-inline-quiz-editorial-ux-20261110`, based directly on merged `main` after PR #30 (`f386a490`).
- Original minimal-modern kit: `aroman_bot_visuals_v2_minimal.zip` (provided as a separate conversation artifact, **not uploaded into GitHub**).
- Expected kit content: `bot_avatar_640.png`, `welcome_1280x720.jpg`, `result_fallback_1200x675.jpg`, `decorative_icon_concepts.svg`, `preview_contact_sheet.jpg`, `manifest.json`, `README.md`, `proposed_profile_fa.md`, `provider_qa_checklist.md`.
- Color direction: warm ivory `#F7F2EB`, soft stone `#E8DDD0`, charcoal `#30302E`, muted gold `#C9A46C`.
- Keep questions text-only. Optional media for welcome and results requires approved HTTPS hosting and successful live tests; the bot's static `photo` paths do **not** upload their referenced files to a provider.

## Local smoke test preparation

Create one isolated provider bot identity for **each provider**, with a public username containing `test`, `qa`, or `sandbox`. Open a **private conversation with that exact test bot** and send it `/start` once, so it can message your test chat. Do not use `@aroman_bot` or the live Telegram bot. Do not switch tokens in a running container.

The harness `scripts/qa-bot-provider-edit.mjs` only calls provider methods `getMe`, `getWebhookInfo`, `sendMessage`, `editMessageText`, optional `sendPhoto`/`editMessageCaption`, and `deleteMessage`. It does **not** poll updates, subscribe a webhook, or touch any database.

On an isolated local checkout of the reviewed branch, run with Node.js 24:

```bash
umask 077
mkdir -p "$HOME/.config/aroman-bot-qa"

# Create/inspect a private token file for a NON-PRODUCTION QA bot:
# example: $HOME/.config/aroman-bot-qa/telegram-token
# chmod 600 "$HOME/.config/aroman-bot-qa/telegram-token"
#
# Keep test chat ID and test bot username only in your shell session.
export AROMAN_QA_PLATFORM=telegram
export AROMAN_QA_TOKEN_FILE="$HOME/.config/aroman-bot-qa/telegram-token"
export AROMAN_QA_CHAT_ID="REPLACE_WITH_YOUR_PRIVATE_TEST_CHAT_ID"
export AROMAN_QA_EXPECTED_USERNAME="YOUR_TEST_BOT_USERNAME"

node scripts/qa-bot-provider-edit.mjs --send-test-messages

unset AROMAN_QA_PLATFORM AROMAN_QA_TOKEN_FILE AROMAN_QA_CHAT_ID AROMAN_QA_EXPECTED_USERNAME
```

Repeat on a **separate** Bale test bot, with the Bale-only token, test chat ID and expected QA username. Ensure token files are regular files owned by your user with mode `600` or `400`. The harness suppresses provider error details to prevent accidental disclosure.

To add photo/caption verification, use an **approved public HTTPS JPEG URL** in `AROMAN_QA_PHOTO_URL`. Do **not** use a local `/mnt/data` path, a `sandbox:` download link, or a private/non-public CDN asset. Start with text-only smoke first.

## Mandatory acceptance beyond the smoke harness

The harness validates API edit method compatibility; it does **not** prove the 7+8 live session/outbox progression. Record separate test-account screen recordings or privacy-redacted screenshots of:

1. `/start` -> first quick question (photo welcome may be removed after text send), seven successive answers updating the same question bubble.
2. Last quick answer -> quick result, then eight deep answers; last deep answer -> deep result. Verify old question does not remain usable.
3. Back, stale callback, result sharing (share should **not** overwrite result), restart, `/forget`, `/privacy` and `/help`.
4. With approved media URL, welcome/result photo -> text transition, fallback delete behavior and provider-specific caption support.
5. One retry/transport fault scenario in a disposable store to confirm no unexpected duplicate sends or leakage.
6. Screenshots from **both** Telegram and Bale, with chat identifiers and other personal data redacted.

## Merge/release guardrails

- PR #30 (release-source reconciliation) was merged after green CI and documentation review; merging that PR did not deploy or restart workers.
- PR #31 code can be reviewed and merged independently of **production deployment**, but do not claim real-provider acceptance until the test matrix is filled for both providers.
- No live image rebuild, secret swapping, webhook change or worker restart without a new explicit production release plan.
- Avatar/name updates are separate bot-profile actions through provider administration; no code PR changes them.

### Evidence log

| Gate | Telegram | Bale |
|---|---|---|
| Synthetic unit tests | CI PASS | CI PASS |
| Real-provider edit smoke | NOT RUN | NOT RUN |
| Real 7+8 end-to-end test | NOT RUN | NOT RUN |
| Approved public image URL | NOT READY | NOT READY |
| New production immutable image | NOT BUILT | NOT BUILT |
| Production UX deployment | NOT AUTHORIZED | NOT AUTHORIZED |
