# Planning Workflow

## Purpose
Provide a stateful, retry-aware workflow engine for planning phases (`ANALYZE`, `RESOLVE_PACKAGES`, `INSTALL_PACKAGES`, `BUILD`, `DEPLOY`, `RECOVER`).

## Public API
- `engine.ts`: `createWorkflow`, `advanceWorkflow`, `getWorkflowStatus`, `cancelWorkflow`
- `stepRunner.ts`: workflow-step dispatch with locking
- `steps/*`: concrete step executors

## Flow
1. Create workflow state and persist it.
2. `advanceWorkflow` executes current step with retry policy.
3. Step runner applies phase lock and delegates to step implementation.
4. Engine updates workflow history/current step/status and persists transitions.

## Common Failure Modes
Use this list for first-pass triage when workflow progress stalls.
- Workflow lock acquisition failure (`resolve:*` / `build:*`)
- Missing or stale sandbox state during install/build
- Dependency resolution failures (invalid package set)
- Build validation failure causing recover/fail transitions
