# Runs Module

## Purpose
Manage run orchestration, worker execution, stream persistence, and terminal state transitions.

## Public API
- `messageOrchestrator.service.ts`
- `agent-run-worker/processor.ts` + `agent-run-worker/*`
- `staleRunReaper.service.ts`
- `runAdmission.service.ts`
- `runMetadata.ts`
- Internal worker details: `agent-run-worker/README.md`

## Request Flow
1. Message endpoint creates/updates run metadata.
2. Run job is enqueued and processed by worker.
3. Worker invokes stream runtime in `services/chat/session/*`, persists events, and updates run status.
4. Events are streamed through query endpoints.

## Common Failure Modes
Use this list for first-pass triage when run orchestration degrades.
- Run cancellation race conditions
- Stream timeout/termination reason propagation
- Stale queued/running runs requiring reaper intervention
