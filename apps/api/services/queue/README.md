# Queue Module

## Purpose
Execute asynchronous workloads (build, backup, agent-run) via BullMQ with clear handler boundaries.

## Public API
- `enqueueBuildJob`, `enqueueBackupJob`, `enqueueAgentRunJob` in `enqueue.ts`
- Worker dispatch entry in `queue.worker.ts` (app root)
- Job handlers in `workerJobHandlers.service.ts`
- Retry/timeout/idempotency policies in `workerPolicies.ts`

## Request/Job Flow
1. API/service enqueues validated payload.
2. `queue.worker.ts` parses payload and dispatches by `JobType`.
3. Handler performs side effects (DB, sandbox, publish events).
4. Worker lifecycle hooks handle logs/failures/shutdown.

## Common Failure Modes
Use this list for first-pass triage when background jobs fail.
- Redis/BullMQ unavailable
- Build job timeout
- Build status publish retries exhausted
- Backup timeout or missing sandbox state
