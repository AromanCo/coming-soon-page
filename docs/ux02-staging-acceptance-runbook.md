# UX-02 isolated HTTPS staging — release preflight (not a deployment authorization)

**Status: prepared, NOT DEPLOYED.** The only live bot change so far is the previously approved UX-01 Bale worker. Telegram, Afra production website, PostgreSQL, Afra–Sweden tunnel, and unrelated services are unchanged. Do not merge either draft UX-02 PR or deploy this stack without owner acceptance and an actual hostname/TLS plan.

## Purpose and immutable inputs

- Visual app: draft PR #34, `/scent-quest/mini`, noindex, 7 quick + 8 deep questions; no server-side user session.
- Optional bot launch: draft PR #35; `BOT_MINIAPP_URL` OFF by default. Do **not** change it during standalone staging.
- Container: independently labeled image built from **one exact PR #34 SHA**, delivered as a checksum-verified encrypted GitHub Actions artifact. Do not rebuild on the constrained Sweden VPS.
- Dedicated Compose project: `deploy/ux02-preview/compose.yaml`; service `miniapp-preview`, port **127.0.0.1:13087:3000**, separate Docker network, no PostgreSQL connection, no bot credentials, no public port, non-root, read-only filesystem.
- **Do not use the existing website's `/api/health`** for this preview: it returns HTTP 503 if the waitlist DB is not configured. The new preview Compose checks `/scent-quest/mini` directly.
- No `NEXT_PUBLIC_SITE_URL`-dependent authorization. A provider query parameter only chooses UI presentation; it does **not** identify a user.

## Bale Web embedding blocker — verified against official documentation

Bale Web launches Mini Apps in an iframe. Its documentation (https://docs.bale.ai/miniapp) requires that `X-Frame-Options` **not** be present and recommends a CSP `frame-src https://*.bale.ai` directive. AROMAN's old Next.js site-wide `X-Frame-Options: DENY` would break the Mini App in Bale Web.

PR #34 therefore excludes **only `/scent-quest/mini` and its children** from global XFO, and adds a Mini-App-specific `Content-Security-Policy` containing `frame-ancestors 'self' https://*.bale.ai https://*.telegram.org` and `frame-src 'self' https://*.bale.ai`. Other routes must **still** return `X-Frame-Options: DENY`. Browser CI verifies actual HTTP response headers. An upstream reverse proxy can add XFO again: verify the **public HTTPS response** before enabling any Bale button. Test both Android and Bale Web manually.

The current Mini App loads its optional provider SDK only when `?provider=bale` or `?provider=telegram` is set, and uses in-memory React navigation. Native provider lifecycle and Back must be checked in-app; browser screenshot success is not equivalent to provider compatibility.

## HTTPS edge setup — configuration to be approved separately

A proposed hostname is **`preview.aroman.ir`**, but its DNS and certificate have not been checked or configured. Do **not** point a production host or `aroman.ir` path at the preview container without explicit review. Any hostname must be within the AROMAN-controlled domain and should be a *separate* TLS vhost.

Only these GET/HEAD surfaces should be routed from preview's public HTTPS hostname to the loopback container:
- `/scent-quest/mini` (and optional trailing slash or query `provider=bale|telegram`)
- `/_next/static/` and `/_next/image` (only if needed; verify assets)
- `/images/scent-quest/`, `/data/scent-quest-perfumes.json`
- `/scent-quest/result/<approved slug>` for public-result review, if explicitly needed
- Small icon/favicon assets required by the rendered app

Return 404 for `/api/*`, `/privacy`, `/#waitlist`, `/admin`, all mutating requests and unrelated routes. The container holds no production secrets, but the image contains the website's full Next.js code—**the reverse proxy allowlist is mandatory**. Do not forward `Authorization`, production cookies, or other privileged headers to preview. Disable access logging of query strings if tokens are ever introduced; this prototype must not use query-token auth.

For initial review use edge-level access control if compatible with the intended browser. **Do not assume HTTP Basic Auth works in Bale/Telegram WebViews.** For real embedded acceptance, use a short-lived, separately approved read-only HTTPS preview without account data, restricted to the routes above, and shut it down afterward. An unlisted/noindex URL is not private access control.

## Safe release sequence (not a command to execute yet)

1. Record exact PR #34 SHA, CI PASS, visual QA PASS, preview image ID/platform/revision and encrypted artifact checksum/provenance.
2. Approve one preview hostname, trusted TLS certificate, its reverse-proxy vhost and rollback (remove preview vhost; stop **preview-only** Compose project).
3. Verify host disk headroom; never run `docker system prune`, alter existing Afra Compose overlays or restart the current production web or Bale workers.
4. Import the verified image without restarting any current service. Diff the dedicated Compose project: **only** one new loopback service/network; no existing DB/web/worker referenced.
5. Start only the preview project, check local `/scent-quest/mini` status 200, actual XFO/CSP response and a healthy preview container.
6. Enable the dedicated HTTPS vhost and run `node scripts/ux02-edge-preflight.mjs https://preview.aroman.ir/scent-quest/mini` after confirming its DNS/TLS are owned by AROMAN. Fail closed on extra exposed application routes.
7. Visually check Bale Web/Desktop, Bale Android, Telegram mobile/desktop in the *actual* clients. Capture only redacted screenshots. Verify opening, Back, all 7+8, result, recommendations, share, and external browser fallback. Keep current chat fallback intact.
8. Only after full acceptance, separately consider merging PR #34 and #35 and a new immutable bot image with `BOT_MINIAPP_URL` configured for **one provider at a time**. No current worker or website changes are part of preview setup.

## Rollback and blockers

- If reverse proxy/HTTPS headers fail, remove **only the preview vhost**, then stop preview-only service; preserve production website and DB.
- If container crashes or security policy fails, do not enable real-bot launch buttons.
- No signed `initData` authentication, chat session sync, identity transfer or server-side quiz writes exist in this prototype; don't claim that finishing in the Mini App updates the chat bot result.
- Third-party product photos are best-effort with a branded fallback. Asset licensing and the official AROMAN visual identity still need owner confirmation.

**No deployment, DNS, certificate, container, bot or service mutation is authorized by this document.**
