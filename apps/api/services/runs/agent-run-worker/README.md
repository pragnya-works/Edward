# Agent Run Worker

## Purpose
Process queued `AGENT_RUN` jobs end-to-end: admission checks, stream-session execution, event persistence, status publication, and terminal finalization.

## Public API
- `processor.ts`: `processAgentRunJob`
- `processor.helpers.ts`: run/session guard helpers
- `processor.events.ts`: event progress persistence and metadata tracking
- `processor.finalize.ts`: success/failure terminal transitions
- `processor.session.ts`: stream-session execution adapter

## Job Flow
1. Validate run state and load run context.
2. Execute stream session for the run.
3. Persist run events and publish progress/status.
4. Finalize run state (completed/failed/aborted) with terminal safeguards.

## Common Failure Modes
Use this list for first-pass triage when agent-run jobs misbehave.
- Missing/stale run context for queued run id
- Duplicate terminal transitions from concurrent/retried jobs
- Publish retries exhausted for run status events
- Stream session abort/timeout resulting in partial progress
