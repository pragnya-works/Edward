# Chat Session Runtime

## Purpose
Own the streaming chat-session runtime: prompt assembly, agent loop execution, parser event handling, sandbox/tool side effects, and final message persistence.

## Public API
- `orchestrator/runStreamSession.orchestrator.ts` (`runStreamSession`)
- `orchestrator/buildPipeline.ts` (`processBuildPipeline`)

## Request Flow
1. Orchestrator resolves framework, prompt, and token budget.
2. Loop runtime streams model output turn-by-turn.
3. Parser events trigger sandbox file writes, dependency install, command, and web-search tools.
4. Finalize path persists assistant output and emits terminal stream metadata.

## Common Failure Modes
Use this list for first-pass triage when stream sessions fail.
- Context window overflow (`context_limit_exceeded`)
- Client disconnect/abort causing incomplete turn finalization
- Sandbox install/command execution failure during parser events
- Strict retry branch producing no recoverable output
