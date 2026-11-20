# Chat Session Runtime

## Purpose

The application-built streaming chat-session runtime assembles prompts, runs
the agent loop, handles parser events and sandbox/tool side effects, and
persists final messages. It calls model provider SDKs without delegating agent
orchestration to a third-party agent framework.

## Public API

- `orchestrator/runStreamSession.orchestrator.ts` (`runStreamSession`)
- `orchestrator/buildPipeline.ts` (`processBuildPipeline`)

## Request Flow

1. The orchestrator resolves the framework, prompt, and token budget.
2. The loop runtime streams model output turn by turn.
3. Parser events trigger sandbox file writes, dependency install, command, and
   web-search tools.
4. Finalization persists the assistant output and emits terminal stream metadata.

## Common Failure Modes

- Context window overflow (`context_limit_exceeded`)
- Client disconnect/abort causing incomplete turn finalization
- Sandbox install/command execution failure during parser events
- Strict retry branch producing no recoverable output
