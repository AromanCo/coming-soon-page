# UX-01 real-bot controlled acceptance — Telegram and Bale

**Operator authorization / scope:** The owner has explicitly elected to use the existing AROMAN Bale and Telegram bots for UX acceptance instead of registering separate test bots. This is **not** authorization for DB migrations, adding a second polling worker, altering live tokens/webhooks, modifying the website, or touching unrelated containers. Preserve the approved current image for rollback.

## Required order

1. **Release preparation**: Verify the approved UX commit, all GitHub Actions checks, and its SHA-labeled Docker image. Build a new isolated production-mode image from the exact commit. Do not reuse the old M5/M6 image tag. Review encrypted image provenance (SHA, image ID, labels, Node/npm lock and tests) and preserve the old image locally.
2. **Bale on Afra first**: Read-only snapshot of `aroman-coming-soon-web-1`, `aroman-coming-soon-db-1`, `aroman-coming-soon-bale-bot-1` and unrelated `rond-bot-bale`, plus current image ID and restart counts; verify current database role, single advisory lock `780302` and secrets. Import new image. Render effective Compose with host-managed files in original order, verify ONLY `bale-bot` image changes and no altered `db/web/migrate` config. Stop/recreate **only** the Bale service using the existing Compose project and `--no-deps --no-build --pull never`. Monitor startup, restarts, PG lock and logs.
3. **Live Bale acceptance** using owner's chat: Send `/reset` or `/start`, verify one clickable text-question message advances through seven quick answers and eight optional deep answers. Check last answer -> result (no old actionable question); Back; stale button; Share result (does not overwrite result); `/forget` and restart; `/privacy`; `/help`. Compare result recommendations against pre-release scoring for same answers.
4. **Only after Bale passes, Telegram on Sweden**: Verify 1.5 GB approximate previous free disk and the tunnel, one Telegram worker/lock `780301`, credentials and unchanged unrelated containers. Prefer transfer of a verified compressed image from a secure build machine; avoid a local Docker build on the constrained Sweden disk. Stop/recreate **only** the Telegram worker, preserving its external `aroman-telegram` network and tunnel. Run the same live-owner acceptance.
5. **Artwork separately**: Current UX code uses **text-only questions** and **optional images** on welcome/results. With no verified `BOT_MEDIA_BASE_URL`, the bot stays text-only. Minimal-modern asset package `aroman_bot_visuals_v2_minimal.zip` has not yet been hosted. Provider image delivery needs publicly reachable HTTPS assets and test chat acceptance before enabling. Provider bot avatar/profile changes require a separate provider administration action; they do not happen through the Docker image.

## Rollback contract

- Capture the exact old image reference and ID for each service, all required env vars, and original four Afra host-managed Compose files and image tag. Never rely on mutable `latest`.
- On unhealthy startup, unexpected restarts, duplicate polls, lock conflict, API editing incompatibility, or failed user acceptance, stop only the affected worker and recreate it from the recorded old image/tag with `--no-deps --no-build --pull never`.
- Do not use `docker compose down`, `down -v`, image prune, volume prune, or any database migration to roll back a bot. Do not run two pollers with one provider token.
- Session/outbox payloads may have been written by the updated worker; preserve the PostgreSQL volume and assess resume behavior instead of restoring the DB as a bot rollback tactic.
- Telegram's external provider/chat may retain already-sent edited or replacement messages even after rollback; do not promise reversal of delivered messages.
- Capture HTTP 200 website health, same DB/web container IDs and unchanged unrelated Bale worker after each change.

## Observability and known limits

- Outbox delivery is at least once; sends at media transitions can duplicate under ambiguous network outcomes. Monitor and stop if repeated duplicate messages appear.
- Provider method compatibility is not guaranteed by synthetic CI. Check **on actual owner chat** after worker replacement. The source's initial send-first photo transitions may create a second bubble before it deletes the old one.
- User-provided snapshot from M7: Sweden disk was 85% used, ~1.5 GB free, with no swap. Check fresh free space and all images prior to any Sweden import.
- The UX design may not alter native Telegram/Bale button fonts/colors. The actual implemented improvement is fewer chat bubbles, cleaner Persian text, progress display and stable inline buttons.
- Accepted egress-policy limitation, privacy review, recovery/reboot, backup/restore proof and security advisory triage remain tracked in the M7 handoff.

**Completion evidence:** report container ID/image ID/restart count and sanitized bot logs for Bale and Telegram, in-app screenshots or concise user PASS/FAIL for the listed flow, and unchanged DB/web identities. Do not include secrets or personal chat IDs in PR comments.
