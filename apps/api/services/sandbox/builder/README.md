# Sandbox Builder

## Purpose
Handle preview build orchestration inside sandbox containers: output detection, fallback SPA runtime generation, base-path injection, and upload preparation.

## Public API
- `unified-build/orchestrator.ts`: `buildAndUploadUnified`
- `output.detector.ts`: build output detection
- `basePathInjector.ts`: runtime base-path rewrites
- `spaFallback/orchestrator.ts`: fallback runtime script strategy

## Build Flow
1. Detect framework/output location from sandbox project state.
2. Execute unified build path or fallback path.
3. Apply base-path/runtime adjustments needed for preview hosting.
4. Return build metadata for upload/publication stages.

## Common Failure Modes
Use this list for first-pass triage when preview builds fail.
- No valid build output directory detected
- Framework-specific output mismatch (expected vs produced artifacts)
- Base-path injection failures causing broken preview asset resolution
- SPA fallback runtime script generation not matching project routing assumptions
