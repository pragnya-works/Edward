# Chat Delivery Module

## Purpose

Handle chat HTTP delivery, including auth, validation, response mapping, and
SSE wiring.

## Public API

- Query controllers under `query/*`
- Message/upload/prompt/subdomain controllers:
  - `message.controller.ts`
  - `image.controller.ts`
  - `promptEnhance.controller.ts`
  - `subdomain.controller.ts`

## Request Flow

1. Route validation and auth middleware run.
2. The controller resolves access and request context.
3. The controller delegates to services or use cases. Streaming runs are queued
   for `services/runs/agent-run-worker/*`, which invokes the stream runtime in
   `services/chat/session/*`.
4. The controller maps the result to a JSON or SSE response.

## Common Failure Modes

- Missing/invalid chat or run identifiers
- Ownership/read-access failures
- SSE stream closure timing and backpressure handling
