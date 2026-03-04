FROM node:22-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94 AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /workspace

COPY . .

RUN pnpm install --frozen-lockfile

# Next.js public env vars are compiled into the client bundle at build time.
# Keep these aligned with production domain routing.
ARG NEXT_PUBLIC_SITE_URL="https://edwardd.app"
ARG NEXT_PUBLIC_BETTER_AUTH_URL="https://edwardd.app"
ARG NEXT_PUBLIC_API_URL="https://api.edwardd.app"
ARG NEXT_PUBLIC_ASSETS_URL=""
ARG NEXT_PUBLIC_SENTRY_DSN=""

ENV NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL}"
ENV NEXT_PUBLIC_BETTER_AUTH_URL="${NEXT_PUBLIC_BETTER_AUTH_URL}"
ENV NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL}"
ENV NEXT_PUBLIC_ASSETS_URL="${NEXT_PUBLIC_ASSETS_URL}"
ENV NEXT_PUBLIC_SENTRY_DSN="${NEXT_PUBLIC_SENTRY_DSN}"

RUN pnpm turbo build --filter=web...

FROM node:22-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94 AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

WORKDIR /app

COPY --from=builder --chown=node:node /workspace/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /workspace/apps/web/public ./apps/web/public

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node

CMD ["node", "apps/web/server.js"]
