# AROMAN Coming Soon release checklist

Review snapshot: 2026-10-30. PR #9 is `feature/scent-quest-polish-v2` → `main`.

## Requirements to merge PR #9

- [x] PR #9 is open against `main` and GitHub reports the required “Tests, types, lint and production build” check successful.
- [x] GitHub reports merge state `CLEAN` at review time.
- [x] Local `npm test` passes (including typecheck and lint); local `npm run build` passes.
- [x] `git diff --check` passes for the review checkout and the new documentation has no trailing whitespace.
- [x] The disposable PostgreSQL-backed suite passes 10/10 checks and the production Caddy trust-boundary suite passes 8/8 checks. They were skipped in the first local `npm test` run because no test environment was configured.
- [ ] Confirm any required human code review/branch-protection approval in GitHub. The PR API response had no recorded review decision; `CLEAN` alone does not establish that a human approval was granted.
- [ ] Review PR #10’s concurrent work if it changes shared files or release assumptions before merging PR #9.
- [ ] Do not treat real screen-reader behavior as verified by the source-level automated announcement assertion; record the manual accessibility check separately.

The final-assets licensing and production configuration items below are deployment/release blockers. The current evidence does not identify a technical code or CI blocker to merging PR #9, subject to the repository’s actual review policy and acceptance of integration results.

## Requirements before production deployment

- [ ] Replace provisional campaign photographs with AROMAN-owned assets, or record legal/brand clearance for every image, including commercial-use rights and applicable model/property releases.
- [ ] Replace the placeholder inline logo/icon with the approved AROMAN master logo and favicon; obtain documented brand approval.
- [ ] Run a real screen-reader and keyboard review across question auto-advance, focus, answer controls, status/error messages, and result controls; fix and retest any defects.
- [ ] Confirm production canonical URL, social links, privacy contact, consent language, and public content with the responsible human owners.
- [ ] Reconcile all 16 open GitHub Dependabot alerts with the current default-branch lockfile and deployed dependency tree; ensure the alerts are resolved or have an explicit, reviewed disposition. Do not rely on stale alert metadata or this branch’s dependency tree as proof about a deployed build.
- [ ] Complete the production deployment rehearsal, including database role/permission checks, migration behavior on the target data model, health checks, backup creation and restore verification, and the public Caddy/client-IP boundary.
- [ ] Verify deployment secrets and environment values through the approved operational process, without exposing them in logs or review artifacts.
- [ ] Obtain explicit deployment authorization and schedule/monitor the production release.
