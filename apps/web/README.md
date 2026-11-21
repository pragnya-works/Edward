# `apps/web`

Next.js frontend for Edward's agent engineering project. It provides a way to explore the backend through chat, streamed run and build state, and the sandbox workspace. The app also hosts auth route handlers.

See the [project overview](../../README.md) for the first-principles goal and production-readiness limitations.

## Key Directories

- `app/`: routes, layouts, metadata, and route handlers
- `components/`: UI by feature (`home`, `chat`, `changelog`, layouts)
- `lib/`: API clients, parsing, streaming processors, query keys, utilities
- `hooks/`: feature hooks for chat/sandbox and server-state flows
- `contexts/`: React context providers (chat stream + sandbox)
- `stores/`: Zustand state slices for sandbox/chat behavior

## Local Commands

Run from workspace root:

```bash
pnpm --filter web dev
pnpm --filter web build
pnpm --filter web start
pnpm --filter web lint
pnpm --filter web typecheck
```

## Environment

Copy `apps/web/.env.example` to `.env.local` and set values.

Common keys:
- `NEXT_PUBLIC_SITE_URL` (recommended for canonical metadata/sitemap host)
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_BETTER_AUTH_URL`
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `NEXT_PUBLIC_ASSETS_URL`
- `NEXT_PUBLIC_CDN_URL` (optional `next/image` remote host allow-list)
- `LINEAR_API_KEY` (optional changelog integration)

## Integration Notes

- Auth handler is in `app/api/auth/[...all]/route.ts` via `@edward/auth`.
- Shared UI/styles come from `@edward/ui`.
- Image remote patterns are configured in `next.config.mjs`.
