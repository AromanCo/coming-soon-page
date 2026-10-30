# AROMAN Coming Soon recovery status

Updated: 2026-10-30. Repository: `AromanCo/coming-soon-page`.

## Current repository and PR state

- PR #9 (`feature/scent-quest-polish-v2` → `main`) is merged. `main` is at `4d6a2d1` in this checkout.
- PR #10 (`feature/scent-companion-telegram-bale` → `main`) is open as a draft at `56b86f6`. GitHub reports merge state `CLEAN` and its required “Tests, types, lint and production build” check succeeded for that commit.
- The local reliability review adds uncommitted work on top of PR #10. No commit, push, merge, deployment, production credential change, or production data change was made.

## Scent Companion reliability state

- The shared scorer still uses 7 quick plus 8 deep questions and the 900-entry catalog.
- Poll processing now commits session changes, queued delivery, and the next poll offset in one PostgreSQL transaction. Duplicate update IDs below the committed cursor are ignored.
- A PostgreSQL session advisory lock allows one polling worker per provider per database, on the pinned connection used for update transactions and outbox delivery. It is released on orderly shutdown and when the database connection closes after a crash. Loss of the lock session exits the worker for supervised restart. Workers configured against different databases are outside that fence.
- Pending messages are delivered from an outbox before new updates are polled. `/forget` deletes the session and any queued messages for that chat in the same transaction before queuing its confirmation. Unsent outbox rows expire after 30 days and are purged on a worker delivery/prune pass; they remain stored while all workers are stopped.
- A repeatedly failing oldest delivery pauses polling of newer updates, preserving response order and bounding backlog. This delays subsequent commands, including `/forget`; document this behavior for test operators and revisit if permanent per-chat provider errors prove common.
- Delivery is at-least-once. If a provider accepts a message but the worker loses the response or cannot delete the outbox row, a retry can send a duplicate. Exactly-once delivery is not claimed.
- Telegram and Bale adapters have only been tested with mocks. No live-provider credentials or calls were used in this review.
- Production bot service configuration remains intentionally absent. The local Compose overlay is opt-in and is not for `compose.prod.yaml`; production also needs a dedicated least-privilege bot database role and separate reviewed deployment configuration.

## Validation

The focused PostgreSQL integration suite uses a disposable loopback database named `bot_test`. It covers advisory-lock ownership and disconnect cleanup, transaction rollback, atomic state/outbox/cursor changes, duplicate updates, failed and ambiguous deliveries, `/forget`, and expiry. The normal `npm test` run skips this suite unless `BOT_TEST_DATABASE_URL` points to `127.0.0.1`, `localhost`, or `::1` and the database name is exactly `bot_test`.

For this review, `npm test` passed 32 tests with 0 failures and 2 unrelated environment-dependent skips. This included all 6 PostgreSQL reliability subtests, plus typecheck and lint. `npm run build` passed. GitHub CI status above refers only to commit `56b86f6`, before these local uncommitted changes.

## Remaining release work

- Verify actual Telegram and Bale behavior in private test chats once approved test credentials are available. Exercise media rejection, ambiguous network failures, restart recovery, and provider-specific callback behavior.
- Decide whether the 30-day pending-message expiry and duplicate-on-ambiguous-send policy meet product expectations.
- Review privacy notice language for temporary queued result messages, which can contain recommendation text until delivered, forgotten, or expired.
- Before any production worker deployment, provide the dedicated database role, production secret handling, database isolation, operational monitoring, and explicit deployment approval.
- Complete the separate website release checklist: final asset clearance, human brand/content review, accessibility checks, dependency alert disposition, and deployment rehearsal.
