# `apps/api`

Express + TypeScript backend for Edward.

This app runs:
- the HTTP API server (`server.http.ts`)
- the background queue worker (`queue.worker.ts`)

## What Lives Here

- `server.http.ts`: API bootstrap, middleware, route mounting, health check, graceful shutdown
- `queue.worker.ts`: BullMQ worker for build, backup, and agent-run jobs
- `routes/`: route registration (`chat`, `api-key`, `github`, `share`)
- `controllers/`: request handlers by domain
- `services/`: core business logic (sandbox, runs, queue, storage, diagnostics, websearch)
- `middleware/`: auth, rate limit, request validation, telemetry
- `schemas/`: Zod request schemas
- `tests/`: API/service unit and integration tests
- `app.config.ts`: validated runtime config derived from env

## Route Groups

Mounted in `server.http.ts`:

- `GET /health` (public)
- `/api-key` (auth + rate-limited)
- `/chat` (auth)
- `/github` (auth + rate-limited)
- `/share/chats/:chatId/history` (public share-history endpoint)

## Local Commands

Run from workspace root:

```bash
pnpm --filter api dev
pnpm --filter api build
pnpm --filter api start
pnpm --filter api lint
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter api test:coverage
```

`pnpm --filter api dev` starts both API and worker concurrently.

## Environment

Copy `apps/api/.env.example` to `.env` and set values.

Core required values include:
- `EDWARD_API_PORT`, `NODE_ENV`, `CORS_ORIGIN`, `TRUST_PROXY`
- `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
- `ENCRYPTION_KEY`
- `REDIS_HOST`/`REDIS_PORT` or `REDIS_URL`
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_BUCKET_NAME`, `AWS_CDN_BUCKET_NAME`
- `OPENAI_MODEL`, `GEMINI_MODEL`

Feature-specific values:
- GitHub auth: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- Preview routing/subdomain: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_KV_NAMESPACE_ID`, `PREVIEW_ROOT_DOMAIN`
- Sandbox/docker: `PREWARM_SANDBOX_IMAGE`, `DOCKER_REGISTRY_BASE`
- Web search: `TAVILY_API_KEY`

## Operational Notes

- Auth is handled via `@edward/auth` session checks in `middleware/auth.ts`.
- Rate limiting uses Redis-backed stores in `middleware/rateLimit.ts`.
- Build/run status events are published for streaming consumers by worker/services.
