# Bot UX-01 — Telegram and Bale provider acceptance (test accounts only)

**Status: NOT YET RUN against provider test bots.** This is the release gate for PR #31, not a record of passed production testing. No secrets, real chat exports, real user identifiers, or token contents may be committed.

## Environment and constraints

- Use separate, owner-controlled **test** Telegram and Bale bot identities and chats. Do not swap production tokens, reconfigure production webhooks, or run a second polling worker against the live Afra database.
- Use disposable local PostgreSQL with synthetic users, or a separate test database with distinct bot passwords and provider roles. Never point `BOT_TEST_*DATABASE_URL` at the live database.
- Run one worker per provider in an isolated environment with its own advisory lock and outbox. Use a unique locally built test image from the reviewed exact commit; do not reuse a misleading production tag.
- Keep `BOT_MEDIA_BASE_URL` unset for the first **text-only** round; test photo/caption behavior only after approved, publicly HTTPS-hosted media URLs are available.
- No Waitlist activation, database migration, server SSH access, public deployment, or broadcast messaging is part of this validation.

## Automated gates

Run on the isolated checkout:

```sh
node --no-warnings --experimental-strip-types --test tests/bot-inline-ux.test.mjs tests/scent-companion.test.mjs
npm test
npm run build
```

The repository's `verify-next.yml` GitHub Actions workflow also runs locked npm installation, tests, typechecks, lint and production build on PRs targeting `main`. Report the actual CI run and SHA; do not infer provider compatibility from mocked tests.

## Provider acceptance matrix

Record PASS / FAIL / NOT RUN separately for Telegram and Bale; attach **redacted** cropped screenshots if necessary.

| Scenario | Telegram | Bale | Required outcome |
| --- | --- | --- | --- |
| `/start` and welcome | NOT RUN | NOT RUN | One welcome response and working primary start action |
| Start Quick | NOT RUN | NOT RUN | First question replaces clicked welcome bubble if it can be edited |
| Questions 1–7 | NOT RUN | NOT RUN | Inline buttons advance one question per answer with consistent progress; no unnecessary new bubbles |
| Last Quick answer | NOT RUN | NOT RUN | Last question becomes **Quick result**; no lingering unanswered question |
| Deep chapter | NOT RUN | NOT RUN | 8 optional steps; Back preserves correct position and answer state |
| Last Deep answer | NOT RUN | NOT RUN | Last deep question becomes **Deep result** |
| Share result | NOT RUN | NOT RUN | Separate share response; result bubble remains intact |
| Stale old button | NOT RUN | NOT RUN | Rejected without advancing persisted state |
| Reset/resume | NOT RUN | NOT RUN | No mixed old and new answers |
| `/privacy` / `/help` | NOT RUN | NOT RUN | Clear disclosure/commands; no personal information in logs |
| `/forget` | NOT RUN | NOT RUN | Existing chat session and queued responses erased; new-start button works |
| Definitively failed edit | NOT RUN | NOT RUN | Replacement is sent before deleting/clearing old question; no dead-end |
| Ambiguous network failure / 429 / 5xx | NOT RUN | NOT RUN | Same intended edit is retried via outbox; no premature fallback duplicate |
| Text-only messages | NOT RUN | NOT RUN | No external images required; inline edits work |
| Photo welcome / question | NOT RUN | NOT RUN | `sendPhoto` and `editMessageCaption` supported by provider and caption fits |
| Image and caption at stage transitions | NOT RUN | NOT RUN | Visual remains context-appropriate; **currently not solved if new media is required** |

## Image and icon boundaries

A separate design-review package contains:
- `bot_avatar_640.png` — monogram concept, **not verified as the official logo**
- `welcome_1280x720.jpg`
- `quick_chapter_1200x675.jpg`
- `deep_chapter_1200x675.jpg`
- `result_fallback_1200x675.jpg` (existing archetype-specific result URLs preferred)
- `icon_set.svg` — decoration only; native Telegram/Bale inline keyboards cannot render custom SVG button icons

None of these assets are hosted or enabled in production by this PR. Do not claim a media change or deploy image files until the owner approves the artwork and both APIs accept the URLs.

**Important current behavior:** `editMessageCaption` updates text/buttons but keeps the original photo. Thus a photo welcome could remain visible for the quick chapter, and a question photo could remain visible under the result caption. To achieve a true matching image on the final answer, a separate provider-validated `editMessageMedia` flow or an explicitly designed replacement-message transition is needed. Do not turn on per-stage images without resolving this tradeoff.

## Sign-off

- [ ] Exact commit SHA and green CI recorded
- [ ] All text-only acceptance cases passed on Telegram test bot
- [ ] All text-only acceptance cases passed on Bale test bot
- [ ] Approved bot visuals (or explicit text-only first release)
- [ ] Provider-specific photo edit and final transition behavior tested
- [ ] Stale callback, retry, DB isolation, privacy and queue saturation verified
- [ ] Owner approval for new immutable images and separate, reversible one-worker-at-a-time deployments

**Until then:** PR #31 remains draft. Both live workers retain their previous pinned images. No production change is authorized.
