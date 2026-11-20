# Engineering trade-offs and revival roadmap

Edward was built to understand an AI-assisted application builder by implementing its agent orchestration and surrounding application logic. Its mechanics include model calls, streaming, tool execution, run state, sandboxing, builds, and previews. It is not evidence of a deployed service, production traffic, or commercial traction. See the [project overview](README.md).

The descriptions below come from the source. Reading code cannot prove runtime behavior, security, performance, or coverage of every edge case. The proposed work is separate from that evidence: each option needs a target environment, an implementation, and failure testing.

## What "from scratch" means

Edward owns its agent loop, output parsing, workflow coordination, run lifecycle, and application-specific tool and sandbox logic. It does not use a third-party agent orchestration framework for those decisions. It does use provider SDKs, BullMQ, Redis, Postgres, Docker, Express, Next.js, Better Auth, and other libraries. It neither trains its own models nor implements those infrastructure components.

Building every dependency would have shifted the exercise away from agent and application architecture. The libraries bring their own behavior, operational requirements, version changes, and failure modes.

## Architectural choices

### Agent runtime

The application-owned [agent loop](apps/api/services/chat/session/loop/agentLoop.runner.ts) manages turns, context checks, tool results, checkpoints, and stop reasons. The [session orchestrator](apps/api/services/chat/session/orchestrator/runStreamSession.orchestrator.ts) assembles the session and handles post-generation work.

Owning the loop makes its decisions inspectable and lets Edward adapt budgets, continuation behavior, and tool handling without fitting a framework's abstraction. It also leaves the project responsible for edge cases, test coverage, provider changes, and compatibility work that a framework might otherwise help with. A custom loop is not inherently correct or faster.

If work resumes, keeping the loop makes sense while understanding and control remain goals. A small, versioned internal contract for model events and tool requests would give those boundaries a clearer definition. Evaluate a framework against concrete requirements and measured maintenance costs, rather than treating it as an automatic upgrade.

### Model adapters, prompts, and output protocol

[Provider adapters](apps/api/lib/llm/provider.client.ts) use SDKs for OpenAI, Gemini, and Anthropic. The [model catalog](packages/shared/src/schema.ts) records capabilities and limits. The [stream tag parser](packages/shared/src/llm/streamTagParser.ts) defines application-specific tags for files and tool actions.

Edward controls how different model streams enter a common execution flow. The text protocol is inspectable and independent of any one provider's tool-call API, but the project must maintain prompts and parsing across model changes, partial chunks, malformed output, and provider-specific semantics. Catalog limits and aliases can become stale. Even a valid model response may produce an unsafe or incorrect application change.

A versioned evaluation corpus should cover chunk boundaries, malformed tags, prompt injection, multi-file changes, and every supported provider. Compare the current protocol with provider-native structured tools where available, retain a common internal event model, and measure reliability before switching. Review capability metadata as providers change.

### Planning and tools

The [planning workflow](apps/api/services/planning/workflow/) implements phases and transitions. [Session event handlers](apps/api/services/chat/session/events/) turn parsed output into side effects, and the [tool gateway](apps/api/services/tools/toolGateway.service.ts) handles tool execution policies and persisted results.

These phases and tools are specific to generated projects and can be examined independently of a vendor's orchestration system. Budgets, validation, and idempotency are explicit concerns. The behavior is also spread across prompts, parsers, handlers, workflow state, sandbox state, and persistence. Retries and crashes around external side effects are particularly hard to reason about. Persisting a tool result alone does not prove that its side effect ran exactly once.

Document each tool's inputs, permissions, timeout, idempotency boundary, and recovery behavior. Exercise failures before, during, and after each external side effect. Where appropriate, require explicit approval or narrower permissions for high-impact tools.

### Durable runs

Run admission and events are stored in Postgres through [run persistence](packages/auth/lib/run.ts). [Run services](apps/api/services/runs/) enqueue and process work using BullMQ and Redis. The [stream service](apps/api/services/run-event-stream-utils/service.ts) supports replay and live events.

The worker runs independently of the HTTP connection, state is persisted, and clients can reconnect using an event cursor. Admission limits and terminal states provide places to enforce concurrency and recovery policies. In return, Postgres, Redis, HTTP processes, workers, and clients must coordinate through restarts, duplicate work, and cancellation races.

[Event persistence and Redis publication](apps/api/services/runs/runEvents.service.ts) are separate operations. An event can commit without live publication if publication fails. Replay helps a reconnecting client, but does not prove a connected client received every event.

Recovery has another boundary. The worker's [claim](apps/api/services/runs/agent-run-worker/processor.helpers.ts) changes only queued runs to running. The [processor](apps/api/services/runs/agent-run-worker/processor.ts) returns if the claim fails, and the [reaper](apps/api/services/runs/staleRunReaper.service.ts) marks stale runs failed. Retrying a job whose record is still running therefore does not, by itself, establish checkpoint-based recovery.

Before changing this path, specify delivery and ordering guarantees. Test worker crashes, publication failure, reconnects, duplicate jobs, stale runs, and cancellation racing with completion. Investigate leased, fenced execution claims and explicit recovery of expired work. If reliable live delivery is required, consider a transactional outbox or periodic reconciliation, make consumers idempotent, and define retention and replay limits. These approaches add complexity and still need retries, monitoring, and tests.

### Streaming UI

The frontend separates [chat stream state](apps/web/stores/chatStream/) from [build and sandbox synchronization](apps/web/hooks/chat/sandbox-sync/). The [SSE parser](apps/web/lib/parsing/sseParser.ts) skips malformed completed JSON frames.

Users can see progress before a long run completes, and build updates can continue after the agent session ends. Cursor-based replay helps after navigation or a dropped connection. But optimistic state, persisted history, local edits, stream cursors, build status, and cross-tab actions can diverge. Skipping a malformed frame keeps the stream moving while potentially hiding a missing update. Reconnection alone does not reconcile state.

Define which source wins for each piece of state. Test slow and duplicated events, malformed frames, reloads, multiple tabs, cancellation, and navigation while file requests are in flight. Surface protocol errors and provide a way to reconcile with authoritative state.

### Sandboxes

[Sandbox provisioning](apps/api/services/sandbox/lifecycle/provisioning.ts) manages containers; [Docker configuration](apps/api/services/sandbox/docker.service.ts) sets a non-root user and resource limits. Provisioning starts the container, then disconnects and verifies networking. The [install phase](apps/api/services/planning/workflow/steps/executeInstallPhase.ts) and [build orchestrator](apps/api/services/sandbox/builder/unified-build/orchestrator.ts) reconnect networking for their work. Their [disconnect helper](apps/api/services/sandbox/utils.service.ts) logs failures without propagating them, so a container may remain connected.

Separate containers and configured resource limits provide a place to inspect generated files and builds. They do not by themselves prove safe multi-tenant isolation. Docker configuration and the host remain part of the security boundary. Dependency installation and build scripts execute untrusted code, and network access during builds expands exposure. Provisioning, recovery, cleanup, and backup also require operational work.

Before accepting untrusted workloads, define the attacker, assets, and isolation requirements. Test egress restrictions, resource exhaustion, process and filesystem isolation, secrets exposure, cleanup, and host compromise paths. If the threat model warrants it, consider dedicated worker hosts or stronger isolation such as microVMs. Compare security, startup time, cost, and operational burden rather than assuming any particular runtime is sufficient.

### Builds and previews

The [build worker](apps/api/services/queue/workerJobHandlers.service.ts) tracks builds separately from agent runs. The [build orchestrator](apps/api/services/sandbox/builder/unified-build/orchestrator.ts) builds and uploads preview files. Partial uploads and unresolved preview routing can be non-fatal, while a successful build result is recorded as success. The [worker timeout helper](apps/api/services/queue/workerPolicies.ts) races a timer against a promise without cancelling the underlying operation.

Generation and preview publication can progress independently, and a build can retain diagnostics even when publication has trouble. A successful build record does not necessarily mean the preview is complete or reachable, though. A timed-out build or backup may continue producing side effects after the caller reports failure. Preview storage, CDN caching, routing, and cleanup add further consistency boundaries.

Define separate states for compilation, asset publication, and preview availability. Publish to an immutable build-specific prefix, verify required assets, and switch the active preview only after verification. Retain or restore the previous known-good preview on failure. Propagate cancellation where supported, fence late results, and reconcile orphaned work. Test partial uploads, stale caches, timeouts, and interrupted publication.

### Source persistence and GitHub sync

Sandbox code has [backup and restore paths](apps/api/services/sandbox/backup.service.ts). [GitHub sync](packages/octokit/index.ts) uses a manifest to track managed files, compares blob hashes, and performs a non-force branch update. Sync does not delete unmanaged paths, but a generated file can overwrite an unmanaged remote file at the same path.

A backup attempt is not a verified restore. The [storage upload helper](apps/api/services/storage.service.ts) returns a failure result rather than throwing, but the backup path does not inspect that result before marking a backup as present. Backup and restore also log and swallow exceptions. Sync must contend with manifest state, concurrent GitHub changes, API failures, and large repository trees. It reads a recursive tree without checking its truncation flag, so large-tree behavior needs investigation before treating the result as complete.

Check and propagate backup failures, set the existence flag only after a confirmed upload, and distinguish a missing backup from a storage failure. Test restoration into a clean sandbox and verify file contents. Add sync tests for concurrent branch updates, missing or invalid manifests, remote edits, deletions, permissions, and truncated tree responses. Define conflict behavior and show a diff before destructive changes; do not silently overwrite user work.

### Identity, keys, and outbound access

[Better Auth configuration](packages/auth/lib/auth.ts) provides GitHub sign-in. [API key services](apps/api/services/apiKey/) and [encryption utilities](apps/api/utils/encryption.ts) handle API keys, while [safe outbound fetch logic](apps/api/services/network/) supports network-facing features.

Existing authentication and provider SDKs avoid reimplementing foundational protocols, and users can supply their own model credentials. Outbound fetch validation provides a place to restrict unsafe destinations. These choices still leave security and privacy responsibilities around keys, GitHub permissions, encrypted data, logs, sandbox contents, and external requests. Bring-your-own-key does not remove the need for secure key handling or cost controls. Application encryption depends on protecting and rotating its encryption key.

Review least-privilege GitHub scopes, secret access and rotation, logging and redaction, data retention and deletion, authorization on every resource, and SSRF defenses across redirects and DNS changes. Run a security review and targeted adversarial tests. Keep secrets and sensitive prompts out of test fixtures and telemetry.

### Infrastructure and testing

The project combines Next.js, an Express API, workers, Postgres, Redis, Docker, and cloud-backed preview components. [API test configuration](apps/api/vitest.config.ts) excludes several infrastructure paths from coverage, and [test setup](apps/api/tests/setup.ts) mocks external dependencies.

The separate components expose asynchronous jobs, isolation, persistence, and streaming. Unit tests can exercise application behavior without running the full stack each time. Local setup and debugging cross process boundaries, however, and mocked unit tests cannot prove real service integration. [API configuration](apps/api/app.config.ts) reduces the Redis URL to host and port for both BullMQ and the [application Redis clients](apps/api/lib/redis.ts); URL credentials, TLS, and database selection are not applied. Cloud and credential configuration also constrain deployment choices.

Start with a repeatable local integration environment and a small real-service test suite. Add Docker, Postgres, and Redis integration tests; a sandbox-to-preview smoke test with isolated cloud resources where needed; migration and restore tests; and failure injection. Make all Redis connection configuration support the deployment's actual authentication and TLS requirements. Keep fast unit tests, but do not treat a coverage percentage as a substitute for integration checks.

## A practical revival sequence

Choose the target first: a local learning environment, a controlled demo, or a service accepting untrusted users. Each requires a different level of isolation, operations, and verification. There is no need to build a multi-tenant platform just to resume the learning project.

1. Re-establish a reproducible baseline. Pin and install dependencies, review current provider models and credentials, run migrations, and document a clean local setup. Run existing checks and a complete prompt-to-preview-to-GitHub scenario. Record what works and the environment used.
2. Make the core flow trustworthy. Separate build success from preview readiness, handle partial publication, make backup failure visible, and define cancellation, retry, event delivery, and recovery semantics. Add tests for failures at those boundaries, including worker restart and reconnect.
3. Evaluate the agent. Build a representative task corpus with expected observable outcomes. Track generation success, build success, task correctness, tool failures, token usage, latency, and cost by model. Include failed cases and human review; a successful build alone does not establish task quality.
4. Harden the execution boundary. Threat-model generated code and external input. Test sandbox escapes, egress, dependency execution, authorization, secrets, and resource exhaustion in an isolated environment. Choose an isolation model based on intended users and measured risk.
5. Prove operations before broader access. Exercise real Postgres, Redis, Docker, and preview storage together. Test backup restoration, migration rollback strategy, queue recovery, incident response, monitoring, and load at a chosen target. Define availability and recovery objectives before deciding whether the system meets them.
6. Expand only with evidence. Consider collaboration, more frameworks, richer editing, deployments, or a managed offering after the core loop is dependable for its intended use. Each addition brings security, cost, and support obligations.

## Decisions to revisit, not promises

- **Custom runtime or agent framework?** Keep the custom loop for control and learning. Compare alternatives if provider compatibility or maintenance becomes the bottleneck, and preserve reproducible evaluations during any migration.
- **Docker or stronger isolation?** Docker can be practical in a controlled environment. A public untrusted-code service needs a threat model and evidence before selecting its boundary.
- **Redis pub/sub or durable delivery?** Pub/sub plus database replay keeps the live path simple. An outbox, durable stream, or reconciliation adds operational complexity but may be justified by stricter delivery requirements.
- **Cloud preview or local-only?** Cloud publication enables shareable previews but adds credentials, routing, cache consistency, and cost. Local preview may be enough for learning and development.
- **BYOK or managed model access?** BYOK shifts provider billing to the key owner but still requires secure credential handling. Managed access adds billing, quotas, abuse prevention, and financial exposure.
- **More features or a smaller supported surface?** Each model, framework, integration, and preview mode multiplies the cases to maintain. Remove or defer unsupported combinations rather than implying parity without evidence.
