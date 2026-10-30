# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e

FROM node:24.22.2-alpine@sha256:4eefa1bfce4197942661ef9148247d779ddf1bb0ee006d3294a467609de60724 AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS revision-check
ARG AROMAN_BUILD_REVISION
ARG AROMAN_RELEASE_CANDIDATE=true
RUN if [ "$AROMAN_RELEASE_CANDIDATE" = "true" ]; then \
      case "$AROMAN_BUILD_REVISION" in \
        ''|unknown|local|*[!0-9a-f]*) echo "Release candidates require a full lowercase Git SHA" >&2; exit 1 ;; \
      esac; \
      [ "${#AROMAN_BUILD_REVISION}" -eq 40 ] || { echo "Release candidates require a 40-character Git SHA" >&2; exit 1; }; \
    fi

FROM revision-check AS dependencies
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_INSTAGRAM_URL
ARG NEXT_PUBLIC_TELEGRAM_URL
ARG NEXT_PUBLIC_LINKEDIN_URL
ARG NEXT_PUBLIC_PRIVACY_EMAIL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_INSTAGRAM_URL=$NEXT_PUBLIC_INSTAGRAM_URL
ENV NEXT_PUBLIC_TELEGRAM_URL=$NEXT_PUBLIC_TELEGRAM_URL
ENV NEXT_PUBLIC_LINKEDIN_URL=$NEXT_PUBLIC_LINKEDIN_URL
ENV NEXT_PUBLIC_PRIVACY_EMAIL=$NEXT_PUBLIC_PRIVACY_EMAIL
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM revision-check AS runner
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
LABEL org.opencontainers.image.revision=$AROMAN_BUILD_REVISION

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# npm is only needed in the build stage. Removing its bundled CLI dependency
# tree from the runtime image avoids shipping unused vulnerable packages.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "server.js"]
