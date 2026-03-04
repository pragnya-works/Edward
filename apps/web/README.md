# `apps/web`

Next.js frontend for Edward (App Router). This app renders the UI, streams chat/build state, and hosts auth route handlers.

## Key Directories

- `app/`: routes, layouts, metadata, and route handlers
- `components/`: UI by feature (`home`, `chat`, `changelog`, `sandbox`, layouts)
- `lib/`: API clients, parsing, streaming processors, query keys, utilities
- `hooks/`: feature hooks for chat/sandbox and server-state flows
- `contexts/`: React context for the chat stream action controller (see note below)
- `stores/`: Zustand state slices for sandbox and chat stream behavior

## State Management Architecture

Zustand is the primary reactive state layer. React Context is used in exactly one place — `contexts/chatStreamContext.tsx` — and only because the chat stream controller must own non-serializable React-managed instances:

- `useRef` maps for in-flight `AbortController`s and mutation-deduplication tracking
- `useMutation` from TanStack React Query (a React hook — cannot be called from Zustand)
- `useQueryClient()` which requires the React Query provider tree
- A `useEffect` cleanup that aborts all live streams on provider unmount

All **state** (stream maps, sandbox files, build status, etc.) lives in Zustand and is read directly by consumers via fine-grained selectors in `stores/chatStream/hooks.ts` and `stores/sandbox/hooks.ts`. The context only distributes stable **action functions** backed by those refs.

### Sandbox side-effects

`components/sandbox/SandboxEffects.tsx` is a pure side-effect host (not a context provider). It registers:
1. A `useLayoutEffect` that syncs `routeChatId` and closes the sandbox on route changes.
2. A `useEffect` that registers the `Cmd/Ctrl+P` keyboard shortcut, reading `isOpen` from the Zustand store snapshot inside the handler (registered once — no teardown on open/close).

### `beforeunload` guard

`hooks/chat/useStreamUnloadGuard.ts` owns the browser `beforeunload` warning, decoupled from the stream provider.

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
For production deploys, use `apps/web/.env.production.example` as the baseline.

Common keys:
- `NEXT_PUBLIC_SITE_URL` (recommended for canonical metadata/sitemap host)
- `NEXT_PUBLIC_API_URL` (recommended production value: `https://api.edwardd.app`)
- `INTERNAL_API_URL` (optional, recommended for container-internal readiness probes)
- `NEXT_PUBLIC_BETTER_AUTH_URL`
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `NEXT_PUBLIC_ASSETS_URL`

Important for Docker/AWS deploys:
- `NEXT_PUBLIC_*` values are compile-time for client bundles. They must be set during image build (not only ECS runtime env injection).
- The deploy workflow passes build args for `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_BETTER_AUTH_URL`, and `NEXT_PUBLIC_API_URL` so production bundles are pinned to `https://edwardd.app` and `https://api.edwardd.app`.

## Integration Notes

- Auth handler is in `app/api/auth/[...all]/route.ts` via `@edward/auth`.
- Shared UI/styles come from `@edward/ui`.
- Sentry + image remote patterns are configured in `next.config.mjs`.
- Deployment probes:
  - `GET /api/health` (liveness)
  - `GET /api/ready` (readiness with DB + upstream API health checks)
