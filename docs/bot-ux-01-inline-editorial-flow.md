# AROMAN Bot UX-01 — in-place quiz and editorial polish

**Status:** draft engineering candidate (2026-11-10). Both production bots remain on their previously approved images. This document does not authorize deployment.

## User requirement and observed baseline
The operator requested that after answering a question, the previous bot question be **overwritten in the same message** instead of adding a new question bubble. The supplied Telegram HTML export shows consecutive message bubbles for seven quick and eight deep questions. Preserve the question set, scoring, result links and privacy behavior.

## Design and interaction
- Welcome: premium, concise Persian, one main discovery CTA plus a website link.
- Questions: heading, stage, Persian question count, dot progress, native inline buttons, back action.
- A callback updates the **same message** with the next question; the last quick/deep answer replaces the previous question with its corresponding result.
- Results: existing ranked recommendations, readable archetype/accord hierarchy, deeper discovery, share, restart. No disabled waitlist CTA.
- Stale/old callbacks must not advance state; /forget and /privacy remain accessible by their existing commands. A /forget confirmation has a fresh-start button. Sharing does not replace the result bubble.
- No new database migrations, waitlist changes, score changes or data exposure.

## Delivery integrity
- Outbox retains a callback edit target (bot message ID and text/photo kind) within the existing provider-scoped JSON view.
- State, update cursor and response intent still commit **before** provider delivery.
- Text-only question -> next question uses `editMessageText` in one bubble. Welcome/result photos are **not reused** as question backgrounds. Photo -> text and text -> result photo use send-first, then best-effort delete the old bubble. `editMessageCaption` is reserved for an explicit `reusePhoto` decision when the image truly should stay the same.
- Never clear the buttons after a successful edit, as this could erase the next question's options.
- After a definite provider edit rejection, send a replacement first, then best-effort delete the old question (or clear its old buttons when deletion is refused). Keep the old question intact if replacement delivery fails. After an ambiguous network failure, **do not** send a duplicate fallback.
- A retry receiving 'message is not modified' is considered delivered, consistent with at-least-once outbox semantics. Rate limits (429) and provider/server failures retain the retry path without automatic duplicate sends.
- Media remains opt-in using `BOT_MEDIA_BASE_URL` and must be approved/hosted first. The project intentionally avoids the unverified `editMessageMedia` API on Bale. No photo replacement is approved in this phase.

## Visual design direction
- Shared Telegram/Bale visual language: **warm ivory, soft beige, charcoal typography, muted champagne gold**; calm and concise Persian. Dark plum is no longer the approved visual direction.
- Review a welcome cover, result fallback and square avatar as a separate v2 minimal-modern asset package. Quiz questions must remain text-only. Assets are prepared for owner review but are not hosted or committed to this PR.
- Avoid embedded Persian copy in artwork, unsupported native CSS, unlicensed perfume photography, and implicit image delivery from an unverified URL.

## Acceptance gates
1. Unit tests for both providers: edit existing message, photo caption, definitive fallback, ambiguous failure, retry idempotency, stale buttons, 7+8 question progression and disabled waitlist.
2. Existing Node test suite, typecheck, lint and build must pass.
3. Disposable PostgreSQL/mock provider integration must preserve transactional outbox behavior, /forget, reset, busy lanes and redacted logs.
4. Test account acceptance is required for Telegram and Bale text and caption editing, RTL layout, keyboards and final results.
5. No production deployment without separate authorization, immutable release image, one-worker-at-a-time rollback and proof that website, PostgreSQL, tunnel and unrelated bots remain unchanged.
6. Image hosting, rights, dimensions and actual provider rendering require separate acceptance before enabling BOT_MEDIA_BASE_URL.

**Non-goals:** new scoring, provider permission changes, migrations, waitlist activation, server maintenance, marketing outreach.

### Minimal-modern asset delivery (separate from code)

The separately generated `aroman_bot_visuals_v2_minimal.zip` contains `bot_avatar_640.png`, `welcome_1280x720.jpg`, `result_fallback_1200x675.jpg`, decorative SVG icon concepts, a preview contact sheet, a SHA-256 manifest and Persian profile copy. These files exist only as a review package; they are **not in GitHub, on the AROMAN website or in a provider-accessible media origin**. Never enable new image paths until the owner approves the artwork and validated HTTPS assets have been published.

A new photo at a transition is sent before the old message is removed. Provider deletion may fail, leaving a harmless older message with disabled buttons; in-flight responses may also retry after ambiguous failures. Actual Telegram/Bale test-account acceptance remains required before rollout.
