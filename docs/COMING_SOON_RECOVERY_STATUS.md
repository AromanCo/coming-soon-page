# AROMAN Coming Soon recovery status

Review snapshot: 2026-10-30. Repository: `AromanCo/coming-soon-page`.

## Current state

- Checkout: `feature/scent-quest-polish-v2`, commit `5a5bb5689e0aa10c4a6759ee3e7205ab6e4fd1e5`, clean before this review.
- PR #9 (`feature/scent-quest-polish-v2` → `main`) is open. GitHub reports its “Tests, types, lint and production build” check as **SUCCESS** and merge state `CLEAN`.
- PR #8 (Scent Quest v1), #7 (verifiable Docker rebuilds), #6 (Scent Explorer to waitlist), and prior V2/V3 release PRs are merged. PR #10 (Scent Companion bots) is also open and separate from PR #9.
- This review did not commit, push, merge, deploy, or modify credentials or production data.

## Completed features in the current project

- Persian mobile-first AROMAN landing page, privacy page, FAQ, social links, responsive imagery, and waitlist signup flow.
- PostgreSQL-backed waitlist with Iranian mobile normalization, consent, anti-abuse/rate-limit behavior, migrations, health route, and production proxy trust checks.
- Scent Explorer and two-stage Scent Quest, deterministic recommendation catalog, result pages, social cards, share/copy/download tools, and recent keyboard/assistive-technology-oriented changes.
- Docker development and production stack definitions, Caddy configuration, backup/restore scripts, deployment runbook, and CI for tests/types/lint/build.

## Verification performed for this review

- `npm test`: passed (13 passed, 0 failed, 2 skipped); included typecheck and ESLint. The skips were “PostgreSQL-backed mobile waitlist integration” and “production Caddy trust boundary and waitlist behavior”.
- `npm run build`: passed on Next.js 16.4.1.
- `git diff --check`: passed after the documentation edits; both new documents were also checked for trailing whitespace.
- PR #9 GitHub CI: successful at review time.
- The waitlist PostgreSQL suite passed 10/10 checks against a uniquely named disposable stack with synthetic test data. The production Caddy proxy suite passed 8/8 checks in a separate isolated run. A production-like stack simulation, role/restart checks, and encrypted backup/restore verification also passed. The standard script's fixed project name had existing volumes, so it was run only through temporary copies under fresh unique project names; both new projects/volumes were removed. Existing volumes were not used or removed.

## Open work and approvals

- Run actual screen-reader checks for the Scent Quest, including question transitions, choice naming/pressed state, focus position after auto-advance, result/error announcements, and keyboard-only operation. Automated source assertions are not a substitute for NVDA/Firefox, VoiceOver/Safari, or another representative screen-reader session.
- Obtain an approved AROMAN master logo, favicon, and final campaign photography, or obtain documented commercial, model/property, trademark, and brand clearance for each retained asset. `public/images/README.md` records the current photographs as provisional and uncleared; the inline mark is a placeholder.
- Obtain human brand/legal approval for final brand assets and public-facing content. Do not infer approval from repository presence or a successful build.
- Review and close or otherwise disposition the 16 open Dependabot alert records. GitHub’s alerts cite historical versions (notably Next.js 14.1.4); the current main/PR lockfile and installed tree contain Next.js 16.4.1 and newer versions of the affected transitive packages. Dependabot alert records should still be checked/closed by GitHub after confirming the default branch’s current dependency graph.
- Finish a production deployment rehearsal and verify deployment-specific environment values, database backup/restore, public URLs, privacy contact, social destinations, and monitoring before release.

## Security alert investigation

GitHub currently returns 16 open Dependabot alerts on the repository, represented by 8 Next.js alert records, 1 each for `brace-expansion`, `nanoid`, `cross-spawn`, `micromatch`, `braces`, and `word-wrap`, and 2 for `semver`. The alert versions are historical: Next.js 14.1.4; `brace-expansion` 2.0.1; `nanoid` 3.3.7; `cross-spawn` 7.0.3; `micromatch` 4.0.5; `braces` 3.0.2; `word-wrap` 1.2.3; and `semver` 6.3.0 / 7.5.0.

The alert first-patched versions include Next.js 14.2.7, 14.2.10, 14.2.15, 14.2.21, 14.2.25, and 14.2.30 (specific advisory-dependent thresholds); `brace-expansion` 2.0.2; `nanoid` 3.3.8; `cross-spawn` 7.0.5; `micromatch` 4.0.8; `braces` 3.0.3; `word-wrap` 1.2.4; and `semver` 6.3.1 / 7.5.2. Current lockfile versions inspected with `npm ls --all` are Next.js 16.4.1, `brace-expansion` 5.0.12, `nanoid` 3.3.20, `cross-spawn` 7.0.6, `word-wrap` 1.2.5, and `semver` 6.3.1 / 7.8.5. No `micromatch` or `braces` package was present in the resolved current tree.

Current dependency paths reported by `npm ls --all` are: direct `next`; `brace-expansion` via `eslint → minimatch → brace-expansion`; `cross-spawn` via `eslint`; `word-wrap` via `eslint → optionator → word-wrap`; `nanoid` via `@tailwindcss/postcss → postcss → nanoid` and `next → postcss → nanoid`; and `semver` via `eslint-plugin-react-hooks → @babel/core → @babel/helper-compilation-targets → semver`, `next → sharp → semver`, and `typescript-eslint → @typescript-eslint/typescript-estree → semver`. These describe the present tree, not the historical vulnerable tree. Dependabot marks several package-lock alerts' relationship as `unknown`, so their precise historical parent paths are not recoverable from the alert response alone.

Next.js is a direct runtime dependency; its server, image optimization, caching, and middleware advisories are production-relevant when affected vulnerable versions and affected features/configurations are in use. The origin-verification advisory is limited to the development server. The other named packages resolve through build/lint/tooling paths in the inspected current tree and are development dependencies there; their applicability to production depends on whether development dependencies are included in the deployed artifact. The current branch does not automatically upgrade dependencies as part of this review. Historical alert metadata is not proof that the presently deployed artifact is safe; reconcile the GitHub alert state against the deployed lockfile before production.

`npm audit --json` on the current checkout reported zero vulnerabilities across 251 resolved dependencies. This is a point-in-time audit of the checked-out lockfile and does not close or explain GitHub's historical open alert records.

## Asset provenance

`public/images/README.md` identifies the V3 photos as provisional Unsplash-derived assets without verified commercial-use, model/property, trademark, or AROMAN ownership clearance. It specifically asks to replace or legally clear the photos and says no approved master logo is present. `NOTICE.md` says the older `public/images/aroman-hero.png` was generated specifically for this project; that provenance statement does not clear the other assets or approve the campaign. GPL-3.0 provenance and notices are described in `LICENSE`, `NOTICE.md`, and the README; distribution/relicensing decisions still need appropriate review.
