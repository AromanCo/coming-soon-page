# AROMAN M7 — two-VPS operational handoff (2026-11-10)

**Status:** M7.1 Afra infrastructure PASS; M7.2 Sweden Telegram integration PASS after independent lock diagnostics; M7.3 configuration-only recovery readiness PASS on both servers. M7.4 is this **draft operational record**, pending owner/security review. It does not grant authorization for further production changes.

**Evidence boundary:** The technical PASS results below are operator-supplied console outputs, not an independently observed end-to-end reboot, restore, or firewall audit. The repository is public; private endpoint addresses, SSH configuration, tokens, passwords, and private key material must remain outside it.

## Service topology

| Site | Purpose | Verified runtime state |
| --- | --- | --- |
| Afra | Existing website, PostgreSQL 16.14, and AROMAN Bale worker | Web and DB healthy; Bale polling active; all three running with zero restarts at M7 inspection |
| Sweden | AROMAN Telegram worker only | Running with zero restarts, approved image retained locally, isolated Docker network present |
| Between hosts | Host-managed authenticated tunnel for Telegram -> Afra PostgreSQL | Afra tunnel service active, enabled on boot, and configured for always-restart; Sweden application authenticated through tunnel |
| External | AROMAN public website | Public HTTPS returned HTTP 200 at M6/M7 checks |

The Telegram worker uses database login `aroman_bot_telegram` and Bale uses `aroman_bot_bale`. Both use **the same Afra PostgreSQL database** and per-provider row-level-security policies bound to PostgreSQL `session_user`. They are separate polling services with no published ports. The existing unrelated Bale application on Afra was confirmed running and must not be modified as part of AROMAN operations. The website waitlist was not enabled or modified.

## Release and provenance

- **Telegram / Sweden:** approved running image tag `aroman-scent-companion:6c99b9a446bf6654f8062234d045c0420607ef76`; the operator verified the tag, non-root image user, read-only root filesystem, restricted networking, no published ports, and no inline token/password variables. This handoff does not establish an independent registry digest for the M5 image.
- **Bale / Afra:** approved source `3b7438c7f68adbbe93f9e04a98a49b814d8d9bfe`; running image tag `aroman-scent-companion:3b7438c7f68adbbe93f9e04a98a49b814d8d9bfe-m6slim`; verified local image ID `sha256:f52253bd9e360f7dc700de156f87774bfcbe6313eb32c4cd631490da29d9f49f`. The node image runs as unprivileged `node`; runtime imports and Node/pg dependencies passed offline checks.
- **Offline image delivery:** GitHub Actions run [42807795426](https://github.com/AromanCo/coming-soon-page/actions/runs/42807795426) passed its pinned image build, offline runtime verification, encryption and artifact upload. The encrypted artifact was downloaded, checksum-verified, decrypted as a stream and imported on Afra. The short-lived Actions artifact expires 2026-11-17; durable retention of the *approved* image and recovery material must be separately planned. Store the private decryption identity only in a secure, access-controlled location outside the repository, with a protected backup.
- **Repository tracking:** The M6 workflow and corrected Bale overlay are on review commit `55e45dda5eb3d0cd5742b850f936061d13e81d5e`; verify the merge status separately before treating these changes as on `main`. Do not replace Afra's old production checkout or build from it as a shortcut.

## Acceptance evidence

| Gate | Evidence from operator |
| --- | --- |
| M6/Bale functionality | `/start`, Scent Quest, and `/forget` passed using a Bale test account |
| M6/Bale database/API | Authenticated as `aroman_bot_bale`; no provider-visible cross-platform rows in read-only checks; `getMe` identified `@aroman_bot`; webhook absent |
| M6/Bale polling | Correct runtime image/security configuration; polling startup log; one held PostgreSQL advisory lock (key `780302`); zero restarts |
| Existing Afra services | Website/database container IDs unchanged from pre-activation record, health green, restart counts zero; public HTTPS HTTP 200 |
| M7/Telegram integration | Correct runtime image/security configuration; database login through tunnel as `aroman_bot_telegram`; read-only provider visibility check passed |
| M7/Telegram lock | Initial combined integration script returned a suppressed failure on its final lock check; later independent Sweden and Afra read-only diagnostics each verified **one granted Telegram advisory lock** (key `780301`). Root cause of the initial check was not established |
| M7/recovery readiness | Docker active/enabled on both servers; workers configured with `unless-stopped`; Telegram Docker network exists; tunnel active/enabled with restart policy `always`; local running Telegram image retained |

The database visibility probes demonstrate no unauthorized rows were visible under the tested queries. They are not a complete re-audit of every production role, grant, RLS policy, or possible query. Functional `/forget` confirmation is not equivalent to independent verification of provider-side deletion or backup expiry.

## Capacity snapshot (operator observation, 2026-11-10)

| Host | Disk | Memory available | Swap |
| --- | --- | --- | --- |
| Sweden | 9.8 GB total, 8.1 GB used, **1.5 GB available (85% used)** | ~2.0 GiB | None |
| Afra | 37 GB total, 24 GB used, ~11 GB available (70% used) | ~5.0 GiB | 2.0 GiB configured |

**Sweden capacity is the most immediate operational warning.** Set a disk/inode alert, investigate growth, and plan additional capacity before major updates or image builds. Do **not** prune Docker images, networks, volumes, or application data without a verified dependency and rollback inventory. Memory availability was acceptable at inspection; absence of swap on Sweden limits shock absorption during spikes.

## Recovery and incident-response contract

1. **Observe before changing:** identify affected provider, worker status/restart count, image ID, Docker daemon state, PostgreSQL health, the tunnel systemd state (for Telegram), advisory-lock ownership, and sanitized worker logs. Check public website health separately. Never print Docker environment dumps, tokens, DB passwords, chat identifiers, raw chat answers, or private records.
2. **Tunnel outage:** first inspect Afra's host-managed tunnel service, its route/network and provider firewall. A running Telegram container does not prove a working tunnel. Restore only the failed tunnel dependency under the infrastructure owner's change process; do not recreate PostgreSQL.
3. **Provider worker failure:** verify whether the appropriate provider lock is held and whether a webhook/second poller exists. The database-backed offset and outbox are retained across worker restarts. At-least-once provider delivery can yield duplicates after ambiguous send results.
4. **Bale rollback:** under an approved change, operate on **only** the `bale-bot` service in Afra's existing Compose project and exact ordered four host-managed Compose files plus corrected Bale overlay. Use `--no-deps --no-build --pull never` for any image-pinned re-creation. Record the previous image ID before changes. Stop only Bale if startup/acceptance fails; do not touch `db`, `web`, `migrate` or the unrelated Bale application.
5. **Telegram rollback:** under an approved change, operate on **only** the Sweden `telegram-bot` service and its already-present image; retain the external `aroman-telegram` network and Afra tunnel. Never start a second Telegram poller against an independent database.
6. **Database incidents:** preserve the existing PostgreSQL volume and current credentials. No migration, role reconciliation, credential rotation or restoration is part of worker restart. Use a separately approved, **tested** database backup/restore runbook; never use `docker compose down -v` or Docker volume pruning.
7. **Post-recovery acceptance:** verify one live worker per provider, correct source/image, correct DB login, exactly one provider lock, healthy Afra DB/web, no unexpected restarts, public HTTPS 200 and test-account commands. Explicitly note anything that cannot be verified.

These are operational constraints, **not authorization to execute a reboot or failover exercise**. The actual service recovery sequence after a host reboot or full database restore has not been exercised.

## Ongoing observation

- Monitor both worker containers for exits/restarts, polling/startup errors and long-running delivery failures, while keeping logs privacy-safe.
- Monitor the Afra tunnel service, the private database connection from Sweden, PostgreSQL health, public website HTTPS, and failed login or unauthorized API behavior.
- Alert on disk/inode depletion, especially Sweden's remaining 1.5 GB; add capacity rather than destructive cleanup.
- Monitor token/webhook conflicts and provider API availability. Never enable a webhook while the corresponding polling worker is operating.
- Use only sanitized summaries for incidents and support tickets. Keep production secrets and raw user interactions out of logs and the public repository.

## Open decisions and limitations

- **Accepted pilot limitation — outbound egress:** full destination-level firewall enforcement for Bale's `bot-egress` and Telegram outbound routes was not independently verified. Docker bridge separation is not a provider HTTPS allowlist. Define, review and test the host/provider policy.
- **Privacy/legal review pending:** owner and reviewer should verify published Bale/Telegram `/privacy` disclosure, platform processing, ~30-day bot session/outbox lifecycle, `/forget` limitations, backups, and third-party provider retention. Do not equate successful commands with formal approval.
- **Restart/recovery untested:** both servers' enablement and restart policies were verified; no real reboot, tunnel interruption or worker crash recovery exercise was performed. Schedule separately authorized maintenance.
- **Backup/restore proof pending:** verify current protected, off-host database backups and perform an authorized disposable restore test; no such production recovery evidence was provided in M7.
- **Sweden disk warning:** 85% used, 1.5 GB available, no swap. Prioritize capacity planning and alerting.
- **Dependency security triage:** GitHub's push response on 2026-11-10 reported 16 Dependabot findings on the default branch (2 critical, 6 high, 5 moderate, 3 low). These were not independently validated or scoped to the deployed runtime; review and prioritize findings without blindly upgrading production images.
- **Source publication/release discipline:** M6 review branch status and the plan for retaining encrypted release artifacts beyond GitHub's 7-day artifact lifetime remain to be resolved.

## Completion record

- M4 provider identities/data isolation: previously established and exercised in M6/M7 read-only probes.
- M5 Sweden Telegram: operational; live user acceptance previously reported.
- M6 Afra Bale: technically deployed and live functional acceptance passed.
- M7.1 Afra health: **PASS**.
- M7.2 Sweden integration: **PASS**, with subsequent independent lock confirmation.
- M7.3 configuration-based recovery readiness: **PASS** on both VPSs.
- M7.4 handoff: **draft for owner/security review**; open operational risks above remain unresolved.

**Change-control boundary:** Do not infer approval for a new production deployment, infrastructure modification, database action, destructive cleanup, or live reboot exercise from this document.
