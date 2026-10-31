# UX-14C: Afra Nginx CSP deployment plan

**Prepared only. No production configuration was changed or reloaded.**

## Effective production policy observed

On 2026-10-31, read-only requests to `https://aroman.ir/` and
`https://aroman.ir/scent-quest` returned HTTP 200 from `nginx/1.24.0 (Ubuntu)`.
Neither response included a `Content-Security-Policy` response header, and the
Scent Quest HTML had no CSP meta tag. Thus the repository Caddyfile is not the
effective policy at these observed routes. The Afra host's full Nginx config
was not accessible from this worktree, so other `server` and `location`
directives still need operator inspection. This observation is not a guarantee
about every route or later configuration changes.

## CSP guidance

If the active Afra Nginx configuration has no CSP, **no CSP change is needed
for UX-14C**. Do not add a CSP automatically. If a CSP already exists and its
`img-src` blocks Atrafshan, preserve the existing policy and add
`https://atrafshan.net` only within that policy's `img-src` directive. Keep all
other directives and avoid a second CSP header.

[`deploy/nginx/aroman-csp.conf.example`](../deploy/nginx/aroman-csp.conf.example)
shows an image-only policy that may be considered as optional security
hardening when no CSP currently exists:

~~~nginx
add_header Content-Security-Policy "img-src 'self' data: https://atrafshan.net" always;
~~~

This optional policy is not a UX-14C release requirement and must not be applied
automatically. If chosen separately, review and approve it as a security
hardening change. Do not copy the repository Caddy policy to Afra as part of
this image change.

The image host returned `Access-Control-Allow-Origin: *` on a read-only HEAD
request. The browser uses anonymous CORS mode and `no-referrer`; the host still
receives the visitor's IP, Origin, request time and technical request
metadata. The privacy page discloses this direct third-party request.

## Operator sequence for an approved CSP change

1. Run `sudo nginx -T`; locate the active TLS server for `aroman.ir`, all
   included files and location-level headers. Confirm the currently active CSP
   state across the routes where Scent Quest and shared results are served.
2. If no CSP is present, make no CSP change for UX-14C. Consider the example
   only as separately approved optional hardening. If a CSP exists and blocks
   the image host, edit only its `img-src`, preserving every other directive.
   If it already permits the host, make no change. Check `add_header`
   inheritance to avoid suppressing or duplicating the policy.
3. Review the exact config diff, run `sudo nginx -t`, and reload only in an
   approved production change window. Do not modify other domains, apps,
   database, waitlist, or deployment configuration.
4. After an approved CSP change, verify `/`, `/scent-quest`, `/privacy`,
   shared-result URLs, a local static image and an API error response. Confirm
   the intended routes emit exactly one CSP header and that existing directives
   other than `img-src` were preserved.
5. Run browser checks at 320, 390, 768, 1024 and 1440px. Verify approved
   Atrafshan images load, broken images retain the AROMAN fallback, Miss Dior
   ID `14185` remains excluded, and no other external image host is requested.
6. Roll back by restoring the backed-up Nginx file, checking with `nginx -t`,
   reloading, and verifying the prior response headers.

The read-only response probe and local browser simulation do not replace the
operator's full `nginx -T` audit, syntax check or post-change verification.
