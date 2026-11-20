# Queue Module

## Purpose

Execute asynchronous build, backup, and agent-run workloads with BullMQ.

## Public API

- `enqueueBuildJob`, `enqueueBackupJob`, `enqueueAgentRunJob` in `enqueue.ts`
- Worker dispatch entry in `queue.worker.ts` (app root)
- Job handlers in `workerJobHandlers.service.ts`
- Retry/timeout/idempotency policies in `workerPolicies.ts`

## Request/Job Flow

1. The API or service enqueues a validated payload.
2. `queue.worker.ts` parses the payload and dispatches it by `JobType`.
3. The handler performs side effects (DB, sandbox, publish events).
4. Worker lifecycle hooks handle logs, failures, and shutdown.

## Common Failure Modes

- Redis/BullMQ unavailable
- Build job timeout
- Build status publish retries exhausted
- Backup timeout or missing sandbox state
