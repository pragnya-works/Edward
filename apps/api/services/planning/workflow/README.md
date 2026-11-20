# Planning Workflow

## Purpose

Edward's application-built workflow engine maintains state and handles retries
for the planning phases: `ANALYZE`, `RESOLVE_PACKAGES`, `INSTALL_PACKAGES`,
`BUILD`, `DEPLOY`, and `RECOVER`. These names describe implementation steps, not
a claim that Edward operates as a live service.

## Public API

- `engine.ts`: `createWorkflow`, `advanceWorkflow`, `getWorkflowStatus`, `cancelWorkflow`
- `stepRunner.ts`: workflow-step dispatch with locking
- `steps/*`: concrete step executors

## Flow

1. Create workflow state and persist it.
2. `advanceWorkflow` executes the current step with a retry policy.
3. The step runner applies a phase lock and delegates to the step implementation.
4. The engine updates the workflow history, current step, and status, then persists the transitions.

## Common Failure Modes

- Workflow lock acquisition failure (`resolve:*` / `build:*`)
- Missing or stale sandbox state during install/build
- Dependency resolution failures (invalid package set)
- Build validation failure causing recover/fail transitions
