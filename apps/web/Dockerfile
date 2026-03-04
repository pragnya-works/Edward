FROM node:22-bookworm-slim AS builder

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
ARG SENTRY_DSN=""
ARG SENTRY_ORG=""
ARG SENTRY_AUTH_TOKEN=""

ENV NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL}"
ENV NEXT_PUBLIC_BETTER_AUTH_URL="${NEXT_PUBLIC_BETTER_AUTH_URL}"
ENV NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL}"
ENV NEXT_PUBLIC_ASSETS_URL="${NEXT_PUBLIC_ASSETS_URL}"
ENV NEXT_PUBLIC_SENTRY_DSN="${NEXT_PUBLIC_SENTRY_DSN}"
ENV SENTRY_DSN="${SENTRY_DSN}"
ENV SENTRY_ORG="${SENTRY_ORG}"
ENV SENTRY_AUTH_TOKEN="${SENTRY_AUTH_TOKEN}"

RUN pnpm turbo build --filter=web...

FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

WORKDIR /app

COPY --from=builder /workspace/apps/web/.next/standalone ./
COPY --from=builder /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /workspace/apps/web/public ./apps/web/public

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
