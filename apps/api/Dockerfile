FROM node:22-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94 AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /workspace

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm turbo build --filter=api...
RUN pnpm --filter api --prod deploy --legacy /out

FROM node:22-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94 AS runner

ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder --chown=node:node /out ./

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:8000/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node

CMD ["node", "dist/server.http.js"]
