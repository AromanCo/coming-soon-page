# UX-02 — Shared visual Scent Quest Mini App (prototype only)

**2026-11-11 status: implementation draft, not deployed.** This branch is intentionally isolated from the live AROMAN website, PostgreSQL and both bot workers. Do not merge or release based on CI alone.

## Why this exists

The owner reviewed 20 Bale production screenshots of UX-01. The 7+8 question flow worked in-place, but native dark chat bubbles, button styles, wallpaper, compact progress and text-only results could not deliver the promised minimal-modern brand experience. See issue #33. Keep the current working Bale worker as-is; do not yet install UX-01 on Telegram.

Bale officially supports Main Mini App, menu, inline and reply-keyboard launch: https://docs.bale.ai/miniapp. Telegram supports Mini Apps through native launch buttons and menu: https://core.telegram.org/bots/webapps. Native chat controls are not CSS-customizable; a webview is the right surface for branded images, typography, animations and result cards.

## Preview route and screen flow

- Local Next.js preview only: `/scent-quest/mini` (publicly *unlinked* and metadata `noindex,nofollow`; not an access-control mechanism).
- Browser-only design preview: no provider query needed.
- Bale presentation adapter: `/scent-quest/mini?provider=bale`.
- Telegram presentation adapter: `/scent-quest/mini?provider=telegram`.
- Intro with short Persian copy and existing AROMAN perfume imagery.
- Seven quick questions with actual catalog question text and option-image mapping, a visible stage indicator and in-memory back navigation.
- Short identity result with validated existing scoring, three actual catalog recommendations and a link/share flow that exposes only the public archetype.
- Eight optional deep questions leading to a fuller result; navigation and reset retained.
- Visual system: #F7F2EB cream, #E8DDD0 stone, #30302E ink, #C9A46C muted gold. Responsive at 320, 360, 390, 430, 768 and desktop; reduced motion supported.

Existing `src/lib/scent-quest/scoring.ts`, `quiz-data.json`, `option-images.ts`, the public catalog and product image fallback are reused verbatim. The old chat bot and old web Scent Quest are not replaced.

## Native integration limitations — do not misrepresent acceptance

The provider query string is **only a UI hint**. It loads the chosen official SDK script and invokes non-sensitive `ready`, `expand`, and header-color methods if available. The Mini App preview **does not read or trust** provider `initDataUnsafe`, submit `initData`, persist chat IDs, or make privileged server calls. It cannot synchronize the browser's answers with the live bot's PostgreSQL session. This is deliberate for a low-risk design prototype.

For a release that performs server operations, first build server-side `initData` verification separately for Telegram and Bale using their documented HMAC protocols, time limits, provider distinction, explicit bot-secret boundaries, and replay/rate controls. Do not grant identity or permission based on `?provider=` or a client-submitted result; keep scoring and service actions server-authoritative where required. Keep waitlist disabled.

Bale's web client may need additional in-memory routing and SDK readiness checks. The prototype currently uses React component state, **not** browser history. Verify SDK methods and back handling in Bale Android, Bale Web/Desktop and Telegram Android/iOS/Desktop separately before hooking production bots.

## Testing/approval phases

1. CI: Next.js build, ESLint, TypeScript and regression tests (including preview invariants).
2. Review actual mobile and desktop renderings, long Persian option labels, slow-loading images, reduced-motion and RTL.
3. Choose approved production assets. Prototype currently uses **existing repository imagery** with recorded sources; the separately generated minimal-modern V2 package is not yet published, uploaded or declared as the official logo.
4. Establish approved HTTPS URL and environment. A public `noindex` page is **not** private; if preview deployed, restrict access with access control. Do not touch Afra production without separate permission.
5. Validate actual launch capability in both providers, then add signed-auth server actions only if chat synchronization or server results are required.
6. Add one tested web_app entry point to each real bot, retaining current chat quiz as fallback; launch workers one at a time with immutable image and rollback plan. This is a **future** separately authorized release.

## Explicit non-goals of this PR

No bot token changes; no `getUpdates` or webhook changes; no new workers or data migrations; no DNS/SSL/VPS changes; no waitlist activation; no production deployment; no collection of chats, phone numbers, profile IDs or quiz answers.

## Acceptance evidence

- [ ] CI fully green on exact PR HEAD
- [ ] User approves screenshots of welcome, question, quick result and deep result
- [ ] Image rights and source URLs approved
- [ ] Bale Android/Web actual Mini App launch and Back tested
- [ ] Telegram actual Mini App launch and Back tested
- [ ] Provider authentication threat model approved if server integration required
- [ ] Owner authorizes separate limited production rollout
