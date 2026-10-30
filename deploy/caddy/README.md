# Locally derived Caddy image

This image is a reproducible, amd64-only derivative of the official Caddy 2.11.7 Alpine manifest pinned in `Dockerfile`. It installs only the Alpine 3.23 signed package archives checked into `packages/`: `brotli-libs 1.2.1-r0` for CVE-2026-111497 and `curl`/`libcurl 8.23.0-r0` for CVE-2026-92392. The Dockerfile verifies SHA-256 and Alpine's APK signature, disables network package resolution, and asserts the installed versions.

The Caddy executable, entrypoint, environment, user, configuration, automatic TLS behavior, and Compose health/security settings come from the pinned official base image. Compose labels the built image with the source revision and package set.

The local image is for review and isolated validation only. Production Compose requires an explicit `AROMAN_CADDY_IMAGE` reference and deliberately has no fallback to this local tag. The candidate has no registry manifest digest until an authorized release pipeline publishes it. Before production use, build from the reviewed commit, record build provenance/SBOM and the resulting image digest, obtain required security/release approval, and set Compose to that immutable published digest. Do not rely on the local image tag as production identity.

Maintenance: periodically review Alpine v3.23 security updates and Caddy releases; update the vendored `.apk` files, SHA-256 manifest, explicit Dockerfile versions, image label, tests, and scan evidence together. Rebuild and rescan after every package or base-image change.
