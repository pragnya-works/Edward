# Sandbox Module

## Purpose

Provision runtime containers, read and write project files, build and upload
previews, and clean up lifecycle resources.

## Public API

- Provision/cleanup: `lifecycle/provisioning.ts`, `lifecycle/cleanup.ts`
- Runtime commands: `command.service.ts`
- Read/write services: `read.service.ts`, `write/*`
- Builders: `builder/unified-build/orchestrator.ts`
- Builder internals: `builder/README.md`

## Request Flow

1. A chat or run requires sandbox access.
2. The lifecycle layer provisions or reuses a sandbox.
3. Read, write, and build operations run in the sandbox.
4. Cleanup and backup jobs attempt to preserve state and release resources.

## Common Failure Modes

- Docker/container inspect/create failures
- Restore/build timeouts
- Stale lifecycle state requiring cleanup/recovery
