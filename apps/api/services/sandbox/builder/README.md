# Sandbox Builder

## Purpose

Orchestrate preview builds inside sandbox containers, including output detection,
fallback SPA runtime generation, base-path injection, and upload preparation.

## Public API

- `unified-build/orchestrator.ts`: `buildAndUploadUnified`
- `output.detector.ts`: build output detection
- `basePathInjector.ts`: runtime base-path rewrites
- `spaFallback/orchestrator.ts`: fallback runtime script strategy

## Build Flow

1. Detect the framework and output location from the sandbox project state.
2. Execute the unified build or fallback path.
3. Apply base-path and runtime adjustments needed for preview hosting.
4. Return build metadata for the upload and publication stages.

## Common Failure Modes

- No valid build output directory detected
- Framework-specific output mismatch (expected vs produced artifacts)
- Base-path injection failures causing broken preview asset resolution
- SPA fallback runtime script generation not matching project routing
  assumptions
