# Sandbox Module

## Purpose

Provision runtime containers, read/write project files, build/upload previews,
and cleanup lifecycle resources.

## Public API

- Provision/cleanup: `lifecycle/provisioning.ts`, `lifecycle/cleanup.ts`
- Runtime commands: `command.service.ts`
- Read/write services: `read.service.ts`, `write/*`
- Builders: `builder/unified-build/orchestrator.ts`
- Builder internals: `builder/README.md`

## Request Flow

1. A chat/run requires sandbox access.
2. Lifecycle layer provisions or reuses a sandbox.
3. Read/write/build operations run in sandbox context.
4. Cleanup and backup jobs keep state durable.

## Common Failure Modes

Use this list for first-pass triage when sandbox operations fail.

- Docker/container inspect/create failures
- Restore/build timeouts
- Stale lifecycle state requiring cleanup/recovery
