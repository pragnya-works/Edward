# Agent Run Worker

## Purpose

Process queued `AGENT_RUN` jobs, including admission checks, stream-session
execution, event persistence, status publication, and finalization.

## Public API

- `processor.ts`: `processAgentRunJob`
- `processor.helpers.ts`: run/session guard helpers
- `processor.events.ts`: event progress persistence and metadata tracking
- `processor.finalize.ts`: success/failure terminal transitions
- `processor.session.ts`: stream-session execution adapter

## Job Flow

1. Validate the run state and load its context.
2. Execute the stream session for the run.
3. Persist run events and publish progress and status.
4. Finalize the run state (completed, failed, or aborted) with terminal safeguards.

## Common Failure Modes

- Missing/stale run context for queued run id
- Duplicate terminal transitions from concurrent/retried jobs
- Publish retries exhausted for run status events
- Stream session abort/timeout resulting in partial progress
