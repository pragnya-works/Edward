# Runs Module

## Purpose

Manage run orchestration, worker execution, stream persistence, and terminal
state transitions.

## Public API

- `messageOrchestrator.service.ts`
- `agent-run-worker/processor.ts` + `agent-run-worker/*`
- `staleRunReaper.service.ts`
- `runAdmission.service.ts`
- `runMetadata.ts`
- Internal worker details: `agent-run-worker/README.md`

## Request Flow

1. The message endpoint creates or updates run metadata.
2. A worker processes the enqueued run job.
3. The worker invokes the stream runtime in `services/chat/session/*`, persists
   events, and updates the run status.
4. Query endpoints stream the events.

## Common Failure Modes

- Run cancellation race conditions
- Stream timeout/termination reason propagation
- Stale queued/running runs requiring reaper intervention
