# Chat Delivery Module

## Purpose

Handle chat HTTP delivery concerns: auth, validation, response mapping, and
SSE wiring.

## Public API

- Query controllers under `query/*`
- Message/upload/prompt/subdomain controllers:
  - `message.controller.ts`
  - `image.controller.ts`
  - `promptEnhance.controller.ts`
  - `subdomain.controller.ts`

## Request Flow

1. Route validation + auth middleware execute.
2. Controller resolves access and request context.
3. Controller delegates orchestration to services/use-cases (including stream
   runtime in `services/chat/session/*`).
4. Controller maps result to JSON/SSE response.

## Common Failure Modes

Use this list for first-pass triage when chat endpoints fail.

- Missing/invalid chat or run identifiers
- Ownership/read-access failures
- SSE stream closure timing and backpressure handling
