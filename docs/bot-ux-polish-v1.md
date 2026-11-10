# AROMAN bot UX polish v1 — in-place quiz and editorial messaging

**Status:** Draft, local/code review only. **No deployment authorized.** Applies to both Telegram and Bale through the same Node.js bot engine.

## Evidence and user-facing problem

The operator's Telegram chat export from 2026-11-10 shows a completed journey with seven quick questions, seven individual question messages, a quick result, eight deep questions in eight more individual messages, then a deep result, sharing and `/forget`. The user requests that answering a question should remove/replace the previous question ("write on it") instead of building a long chat history. The existing source already has an inline callback model, per-provider PostgreSQL locks, durable outbox, and stale-callback rejection.

The delivered change covers **code, copy and regression tests**. It does not embed generated art, set `BOT_MEDIA_BASE_URL`, change profile photos, send live traffic, or alter production.

## Intended message flow

1. **Welcome:** one refined Persian introduction, clear primary button, optional AROMAN website link. Use a branded hero image **only after** the image is publicly hosted and verified on *both* provider APIs.
2. **Quick quiz:** 7 original questions from the existing quiz manifest. A callback answer atomically persists the answer, next state and queued response. The queued response carries the clicked bot message's ID and whether it was text or photo.
3. **In-place update:** delivery attempts `editMessageText` for text messages or `editMessageCaption` for photo messages, replacing question text and inline buttons. The same source bubble advances to question 2, 3, ... 7 and then to the quick result. No edit is attempted before the state/outbox commit.
4. **Optional deep quiz:** 8 unchanged questions, with the same in-place behavior, followed by the deep result. Original scoring, answer mappings, privacy rules and PostgreSQL data paths remain unchanged.
5. **Results:** fragrance personality, three existing ranked recommendations, share and restart controls. The unavailable waitlist link is replaced with a general AROMAN link.
6. **Forget:** keep `/forget` semantics and add a new-start control to its confirmation. `/privacy` remains visible through the supported command.

### Safety and provider compatibility

- Edit only when a provider callback includes a valid private-chat message ID and a known text/photo message type. Manual `/start`, `/privacy`, `/result`, and `/help` responses are separate messages; share remains a separate message.
- For a photo bubble, the v1 adapter **edits its caption but does not replace the photo**. This keeps one stable visual during the 7/8 question chapter. Image-swapping should be separately tested per provider before adoption.
- A definitive, non-rate-limit edit rejection falls back to sending the next view as a new message and then best-effort deleting the old one; if deletion is refused it best-effort clears its old inline buttons. **Perfect deletion is not guaranteed** on all platforms.
- A network-ambiguous edit outcome or HTTP 429/5xx must *not* automatically trigger a second send; the durable outbox retries the edit. A provider "message is not modified" response is treated as an idempotent success.
- Old/stale callbacks remain rejected. In-place responses do not call `editMessageReplyMarkup` prematurely after queuing, which previously would erase the buttons before a queued edit was delivered.
- Outbox-capacity handling does not clear user buttons if their answer and response were not committed.
- Fallback errors/logs must never include tokens, chat IDs, or answer text. The new edit target is persisted only as an outbox metadata field in `view`, automatically subject to existing outbox cleanup.

## Visual language (proposal)

- **Mood:** premium perfume editorial; warm ivory, deep plum, restrained champagne gold.
- **Text:** use consistent conversational Persian (`تو`), short sections, recognizable chapter/step indicators and one primary choice per button. Do not invent new quiz answers or change the official manifest.
- **Icons:** restrained symbols for welcome, progression, sharing and reset. Avoid generic icon spam or mismatched icons repeated for every answer.
- **Photos:** concept art has been created for a welcome illustration and illustrative UX screens. **It has not been committed or deployed.** A future artwork-specific PR should provide optimized, rights-cleared assets, approved hosting, origin configuration, and live `sendPhoto` / caption-edit tests on both providers.
- **Reality check:** Telegram/Bale native clients control chat bubble/keyboard colors and dimensions. The concept image is art direction, *not* a custom HTML UI that these bot APIs can render.

## Required acceptance before any production rollout

- Run bot unit and regression tests, format/lint and TypeScript checks on an isolated checkout. Verify 7+8 scoring, back/reset/resume, share and `/forget` unaffected.
- Test text -> text question edits and text/photo -> result changes using synthetic provider responses, including stale callbacks, queue saturation, 400/429/5xx and ambiguous transport failure.
- Test actual `editMessageText` and `editMessageCaption` with **synthetic or owner-controlled test bots** for both Telegram and Bale, and verify callback acknowledgement and fallback deletion behavior. API method support is documented in Telegram's Bot API and community Bale SDKs but requires live provider confirmation.
- Verify that a photo caption remains under each provider's size limit and that media origins are HTTPS/reachable. Ensure the media photo remains appropriate when the caption changes from a question to a result.
- If an old message cannot be edited/deleted, no committed answer may be rolled back or unexpectedly duplicated, and no private data may appear in logs.
- Keep both live workers and the existing website/DB untouched until a separate release authorization, new pinned image build, and Bale/Telegram-specific rollback procedure are approved.

## Repository and release discipline

This branch is stacked on the M6 release review branch `work/m5-handoff-m6-bale-readiness-20261110`. Do not merge a production release automatically when this UX draft is merged or retargeted. M5 Sweden and M6 Afra currently run independent, pinned images and require explicit new image builds and a separately approved deployment plan.
