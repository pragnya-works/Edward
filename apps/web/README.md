# `apps/web`

Next.js frontend for Edward (App Router). This app renders the UI, streams chat/build state, and hosts auth route handlers.

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
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_BETTER_AUTH_URL`
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `NEXT_PUBLIC_ASSETS_URL`

## Integration Notes

- Auth handler is in `app/api/auth/[...all]/route.ts` via `@edward/auth`.
- Shared UI/styles come from `@edward/ui`.
- Sentry + image remote patterns are configured in `next.config.mjs`.
