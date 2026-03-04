# Edward Monorepo

Edward is a pnpm + Turborepo workspace for the web app, API, and shared packages.

## Workspace Scope

`apps/`
- `apps/web`: Next.js app (frontend + auth route handlers)
- `apps/api`: backend API service

`packages/`
- `packages/auth`: auth + DB schema/helpers used across services
- `packages/shared`: shared types/schemas/utilities
- `packages/ui`: shared UI components/styles
- `packages/eslint-config`: workspace ESLint presets
- `packages/typescript-config`: workspace TS presets
- `packages/octokit`: GitHub API helpers

## Prerequisites

- Node.js `>=20`
- pnpm `10.x`

## Common Commands (from repo root)

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm lint:fix
```

## Notes

- Turbo task behavior and env passthrough are in `turbo.json`.
- Package globs are defined in `pnpm-workspace.yaml`.
- Each app/package README contains local details specific to that directory.
- Production compose template is in `docker/compose.production.yml` (docs: `docker/README.production.md`).
- AWS ECS EC2 Terraform stack is in `infra/aws/terraform`.
- End-to-end AWS runbook is in `docs/AWS_DEPLOYMENT.md`.
