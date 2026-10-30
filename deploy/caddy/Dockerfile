# The official image is pinned to its linux/amd64 manifest digest. Only the
# three Alpine packages required for CVE remediation are changed.
FROM caddy:2.11.7-alpine@sha256:04913b1da43339a40ad1ea87827d70a576ac5aa6cf674c6e24fdca675887533a

ARG AROMAN_BUILD_REVISION

LABEL org.opencontainers.image.revision=$AROMAN_BUILD_REVISION \
      org.opencontainers.image.version="2.11.7-alpine-brotli-1.2.1-r0-curl-8.23.0-r0" \
      org.opencontainers.image.base.name="caddy:2.11.7-alpine" \
      org.opencontainers.image.base.digest="sha256:04913b1da43339a40ad1ea87827d70a576ac5aa6cf674c6e24fdca675887533a" \
      org.aroman.alpine.packages="brotli-libs=1.2.1-r0,curl=8.23.0-r0,libcurl=8.23.0-r0"

COPY packages/ /tmp/aroman-alpine-packages/

RUN set -eux; \
    cd /tmp/aroman-alpine-packages; \
    sha256sum -c SHA256SUMS; \
    apk add --no-network \
      ./brotli-libs-1.2.1-r0.apk \
      ./curl-8.23.0-r0.apk \
      ./libcurl-8.23.0-r0.apk; \
    test "$(apk list -I brotli-libs | cut -d ' ' -f 1)" = "brotli-libs-1.2.1-r0"; \
    test "$(apk list -I curl | cut -d ' ' -f 1)" = "curl-8.23.0-r0"; \
    test "$(apk list -I libcurl | cut -d ' ' -f 1)" = "libcurl-8.23.0-r0"; \
    cd /; \
    rm -rf /tmp/aroman-alpine-packages
