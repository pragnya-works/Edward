# apps/api

TypeScript + Express backend for Edward.

## Runtime Entrypoints

- `server.http.ts`: HTTP process bootstrap (composition root)
- `queue.worker.ts`: background worker bootstrap (composition root)

## Architecture Layers

- `routes/`: HTTP surface and middleware wiring
- `controllers/`: delivery handlers for multi-step request flows (query/run/build/history)
- `services/**`: application/infrastructure orchestration and use-cases
- `lib/**`: shared adapters/clients (Redis, queue binding, LLM helpers)
- `schemas/`: request contracts (Zod)
- `middleware/`: auth, validation, telemetry, throttling

## Delivery Rules

- Prefer importing concrete service/use-case handlers directly in routes.
- Keep controllers focused on request context, response mapping, and SSE stream control.
- Avoid no-op wrappers/re-exports (function pass-throughs, barrel re-exports, type alias pass-throughs).

## Core Module Map

- Chat delivery: `controllers/chat/README.md`
- Chat stream runtime: `services/chat/session/README.md`
- Runs orchestration: `services/runs/README.md`
- Agent run worker internals: `services/runs/agent-run-worker/README.md`
- Sandbox lifecycle/build/read/write: `services/sandbox/README.md`
- Sandbox build internals: `services/sandbox/builder/README.md`
- Queue execution and policies: `services/queue/README.md`
- Planning workflow engine: `services/planning/workflow/README.md`

## Local Commands

```bash
pnpm --filter api dev:deps
pnpm --filter api dev
pnpm --filter api dev:api
pnpm --filter api dev:worker
pnpm --filter api build
pnpm --filter api start
pnpm --filter api typecheck
pnpm --filter api lint
pnpm --filter api test
pnpm --filter api test:coverage
pnpm --filter api quality:baseline
pnpm --filter api quality:file-audit
pnpm --filter api quality:coverage
pnpm --filter api quality:functions
pnpm --filter api quality:boundaries
pnpm --filter api quality:duplication
pnpm --filter api quality:gates
```

## Operational Notes

- `securityTelemetryMiddleware` issues/propagates `x-request-id` for traceability.
- Worker handlers enforce timeout budgets and publish-retry policy for build status events.
- Architecture boundary, duplication, and function-length checks are required quality gates.

## Environment Notes

- Copy `apps/api/.env.example` to `apps/api/.env`.
- `REDIS_URL` or `REDIS_HOST` + `REDIS_PORT` are required.
- `AWS_BUCKET_NAME` and `AWS_CDN_BUCKET_NAME` must be populated even for local stubs because storage modules read them during import.
- `DOCKER_REGISTRY_BASE` is required for worker template resolution.
- `PREWARM_SANDBOX_IMAGE` is required when sandbox containers are created.
- `CLOUDFLARE_*` and `PREVIEW_ROOT_DOMAIN` are only needed for subdomain preview routing.
- `SENTRY_DSN` and `TAVILY_API_KEY` are optional.
