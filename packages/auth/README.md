# `@edward/auth`

Shared authentication and persistence package for Edward.

This directory owns auth setup (`better-auth`), Drizzle schema, and DB helpers for chats/messages/builds/runs.

## Key Files

- `lib/auth.ts`: `better-auth` instance with GitHub provider
- `lib/schema.ts`: Drizzle tables/enums/relations
- `lib/db.ts`: Postgres connection
- `lib/build.ts`: build lifecycle read/write helpers
- `lib/run.ts`: run orchestration persistence + event/tool-call tracking
- `lib/index.ts`: package exports used by apps/services
- `drizzle/`: SQL migrations and snapshots
- `drizzle.config.ts`: migration config

## Local Commands

Run from workspace root:

```bash
pnpm --filter @edward/auth build
pnpm --filter @edward/auth typecheck
pnpm --filter @edward/auth lint
pnpm --filter @edward/auth db:generate
pnpm --filter @edward/auth db:migrate
pnpm --filter @edward/auth db:studio
```

## Environment

Copy `packages/auth/.env.example` and set:
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`

For `pnpm --filter @edward/auth db:migrate`, export `DATABASE_URL` in the same shell session first because `drizzle-kit` reads it from process env at runtime.

## Export Surface

Main exports include:
- `auth` (for route adapters, session/auth flows)
- `db`
- schema and query helpers from `drizzle-orm`
- build/run helpers from `lib/build.ts` and `lib/run.ts`
