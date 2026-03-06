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
- `EDWARD_API_PORT` now falls back to `PORT`, and `REDIS_URL` supports authenticated `rediss://` providers such as Upstash.
- Storage config accepts `AWS_BUCKET_NAME`, `SANDBOX_S3_BUCKET`, or `S3_BUCKET`, with optional `S3_ENDPOINT` / `S3_PUBLIC_BASE_URL` for S3-compatible deploys.
- `SANDBOX_RUNTIME` supports `vercel` and `disabled`. Use `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, and `VERCEL_PROJECT_ID` for Vercel Sandbox-backed execution, or `disabled` with `SANDBOX_RUNTIME_REQUIRED=false` when you only need the API to boot without a sandbox runtime.
