# Edward

I built Edward to understand what goes into an AI-assisted web app builder. You describe an app in chat, and Edward generates code, builds it in a sandbox, shows a preview, and can sync the project to GitHub.

The interesting part for me was building the agent and its surrounding systems from first principles: turning model output into tool actions, keeping runs going when a client disconnects, and getting generated code through a build pipeline. My primary goal wasn't to launch a live service or attract users at scale.

I wrote the orchestration and application logic rather than using an agent orchestration framework. Edward still relies on provider SDKs and existing tools such as Express, BullMQ, Redis, Postgres, Docker, Next.js, and Better Auth. It doesn't train its own models or implement that infrastructure.

The [trade-offs and revival roadmap](TRADEOFFS.md) go into the decisions behind the implementation and what would need work before taking it further.

## Demo

<p align="center">
  <a href="https://www.youtube.com/watch?v=zIBuOmr92_s">
    <img src="https://res.cloudinary.com/duhbdm1sx/image/upload/v1777439615/edward_h3gzyg.png" alt="Watch the demo" width="700" />
  </a>
</p>

## What was built

- The **agent loop** composes prompts, streams responses from OpenAI, Gemini, or Anthropic, tracks token budgets, and decides when to continue or stop. Start with [`agentLoop.runner.ts`](apps/api/services/chat/session/loop/agentLoop.runner.ts), [`provider.client.ts`](apps/api/lib/llm/provider.client.ts), and [`parser.ts`](apps/api/lib/llm/parser.ts).
- The **workflow and tool handlers** coordinate generation and turn model output into file writes, dependency installs, commands, and searches. See [`workflow/`](apps/api/services/planning/workflow/), [`session/events/`](apps/api/services/chat/session/events/), and [`toolGateway.service.ts`](apps/api/services/tools/toolGateway.service.ts).
- **Runs and streaming** keep ordered events in Postgres and let clients reconnect and replay them. The worker also handles cancellation. See [`services/runs/`](apps/api/services/runs/), [`run.ts`](packages/auth/lib/run.ts), and [`run-event-stream-utils/`](apps/api/services/run-event-stream-utils/).
- The **sandbox and build pipeline** writes generated projects to Docker containers, builds them, and uploads preview assets. Build status is tracked separately from the agent run. See [`services/sandbox/`](apps/api/services/sandbox/) and [`services/queue/`](apps/api/services/queue/).
- The **web app** brings chat, the editor, previews, and GitHub sync together. Shared types connect it to the API. See [`apps/web/stores/chatStream/`](apps/web/stores/chatStream/), [`apps/web/hooks/chat/sandbox-sync/`](apps/web/hooks/chat/sandbox-sync/), and [`packages/shared/`](packages/shared/).

## How a request moves through the system

1. The web app sends a prompt to the API, which authenticates the user, records the message, admits a run, and queues it for a worker.
2. The worker runs the application-owned agent loop. Model output is parsed into events that can write files or invoke tools in a sandbox.
3. Run events are persisted and streamed to the client. A reconnecting client can replay events using its cursor.
4. When generated changes require a build, the build pipeline runs separately, uploads preview assets, and publishes build status. Agent completion does not mean the preview is ready.

The demo shows what this looks like in the browser. The links above are a good place to start reading the implementation.

## Repository layout

- `apps/web`: Next.js 16 app-router frontend, auth routes, chat UI, preview UI, changelog UI
- `apps/api`: Express API, BullMQ workers, sandbox orchestration, build pipeline, run streaming
- `packages/auth`: Better Auth setup, Drizzle schema, shared DB access
- `packages/shared`: shared types, schemas, stream event contracts
- `packages/ui`: shared UI primitives and styles
- `packages/octokit`: GitHub sync helpers
- `packages/eslint-config` and `packages/typescript-config`: workspace tooling presets

## Architecture at a glance

- The web app runs on `http://localhost:3000`.
- The API runs on `http://localhost:8000`.
- The API worker processes build and agent jobs from Redis-backed BullMQ queues.
- Postgres stores users, chats, runs, builds, and auth data.
- Docker is required locally because sandbox sessions and generated-app builds depend on containerized execution.
- Users authenticate with GitHub and provide their own OpenAI, Gemini, or Anthropic API key for generation.

## Production readiness

Edward has durable runs, replayable events, rate limits, and Docker resource
limits. Those are useful building blocks, not proof that the system is ready
for production. Before exposing it to other users or untrusted code, test it
in the environment where it will run.

Some limitations to keep in mind:

- A build can be marked successful even when preview files were only partially
  uploaded or no preview URL was resolved. Check preview availability separately.
- Worker timeouts report failure but do not cancel the underlying build or
  backup operation. The operation may continue to produce side effects.
- The BullMQ and application Redis clients use only the host and port extracted
  from `REDIS_URL`. Credentials, TLS, and database selection in the URL are not
  applied to those connections.
- Sandboxes execute generated code. Networking is disconnected after provisioning
  and reconnected for dependency installation and builds. A failed disconnect is
  logged but can leave a container connected. Review isolation, dependency
  execution, and egress controls for your threat model.
- API coverage excludes several infrastructure paths, and its test setup mocks
  external services. Passing the test suite does not verify end-to-end behavior
  against real Postgres, Redis, Docker, or cloud services.

For a production rollout, the generation and preview flow needs testing against
real infrastructure, including failure recovery and the expected load. It also
needs monitoring, alerting, backup and restore procedures, and a security review.

## Prerequisites

- Node.js `22.12+` in the 22.x line or `24+` (CI uses Node.js 22)
- `pnpm` `12.21.0` or compatible `12.x`
- Docker Desktop or another local Docker runtime
- Postgres `15+` or `16+`
- Redis `7+`
- A GitHub OAuth app for local sign-in

Recommended bootstrap (install Corepack 0.34.5 or later compatible with your Node version first):

```bash
corepack enable
corepack prepare pnpm@12.21.0 --activate
pnpm install
```

## Local setup

### 1. Start local infrastructure

If you do not already run Postgres and Redis locally, this is the fastest path:

```bash
docker run --name edward-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=edward \
  -p 5432:5432 \
  -d postgres:16

docker run --name edward-redis \
  -p 6379:6379 \
  -d redis:7-alpine
```

### 2. Create a GitHub OAuth app

Edward expects GitHub auth locally.

- Homepage URL: `http://localhost:3000`
- Callback URL: `http://localhost:3000/api/auth/callback/github`

### 3. Create env files

Create the app env files from the provided examples:

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env
```

Fill in the values described in the examples. Use the same `BETTER_AUTH_SECRET`
in both env files, and use a separate 64-character hex key for `ENCRYPTION_KEY`.
Generate them with:

```bash
openssl rand -base64 32
openssl rand -hex 32
```

Use the first output for `BETTER_AUTH_SECRET` and the second for `ENCRYPTION_KEY`.
Keep both secrets private.

The API requires AWS access-key environment variables at startup even when
previews are not configured. Placeholder credentials do not make AWS-backed
operations work and can take precedence over role credentials. Use valid
credentials for AWS-backed operations; the current validation does not support
relying on a role alone.

### 4. Run database migrations

`drizzle-kit` in `packages/auth` does not load a package-local `.env` automatically. Export `DATABASE_URL` in your shell before running migrations:

```bash
export DATABASE_URL="postgresql://postgres:password@localhost:5432/edward"
pnpm --filter @edward/auth db:migrate
```

### 5. Prepare sandbox images if needed

If the API cannot pull sandbox images or you want local template images available
up front, build them once. Use the same `DOCKER_REGISTRY_BASE` in the shell and
in `apps/api/.env`; the script does not load the env file automatically:

```bash
DOCKER_REGISTRY_BASE="ghcr.io/your-org/edward" ./scripts/build-local-sandboxes.sh
```

This builds the Next.js, Vite/React, and vanilla sandbox images under
`docker/templates/`. Without an override, the script uses
`ghcr.io/pragnya-works/edward`.

### 6. Start the full stack

From the repo root:

```bash
pnpm dev
```

That starts:

- the Next.js frontend
- the API server
- the API worker

Open:

- App: `http://localhost:3000`
- API health: `http://localhost:8000/health`

### 7. First-run checklist

- Sign in with GitHub.
- Add your OpenAI, Gemini, or Anthropic API key in the product UI.
- Start a chat and generate a project.

## CloudFront preview routing

For path-based preview URLs such as `https://yourdomain.com/userid/chatid`, deploy a CloudFront Function that rewrites requests to the `/preview/` folder.

### 1. Create the CloudFront Function

1. Go to AWS CloudFront Console → Functions → Create function
2. Name it (e.g., `edward-preview-rewrite`)
3. Set Runtime to **CloudFront Functions** (not Lambda@Edge)
4. Paste the following code:

```javascript
function handler(event) {
    var request = event.request;
    var uri = request.uri;

    // If URI contains /preview/, it's already a proper preview asset path - pass through
    if (uri.includes('/preview/')) {
        return request;
    }

    // Extract userId and chatId from the URI
    // Pattern: /userid/chatid or /userid/chatid/anything
    var pathMatch = uri.match(/^\/([^\/]+)\/([^\/]+)(?:\/|$)/);
    if (!pathMatch) {
        return request;
    }

    var userId = pathMatch[1];
    var chatId = pathMatch[2];
    var remainingPath = uri.slice(pathMatch[0].length);

    // If it's a file request (has extension) or a subdirectory path, map it to preview folder
    // This handles:
    //   /userid/chatid/styles.css -> /userid/chatid/preview/styles.css
    //   /userid/chatid/assets/logo.png -> /userid/chatid/preview/assets/logo.png
    //   /userid/chatid/_next/static/... -> /userid/chatid/preview/_next/static/...
    if (remainingPath && (remainingPath.includes('.') || remainingPath.includes('/'))) {
        request.uri = '/' + userId + '/' + chatId + '/preview/' + remainingPath;
        return request;
    }

    // /userid/chatid or /userid/chatid/ -> rewrite to /userid/chatid/preview/index.html
    // This rewrites the request internally without redirecting the browser
    request.uri = '/' + userId + '/' + chatId + '/preview/index.html';
    return request;
}
```

5. Click **Publish** and note the function ARN

### 2. Associate with your distribution

1. Go to your CloudFront Distribution → Functions tab
2. Click **Associate function**
3. Choose:
   - **Event type:** Viewer request
   - **Function:** `edward-preview-rewrite` (or your function name)
4. Save changes

### 3. Configure the API

Set the CloudFront values in `apps/api/.env` using `apps/api/.env.example` as a
reference.

### How it works

The function rewrites incoming requests so that:

| Incoming URL | Rewritten To |
|--------------|--------------|
| `/u123/c456` | `/u123/c456/preview/index.html` |
| `/u123/c456/` | `/u123/c456/preview/index.html` |
| `/u123/c456/styles.css` | `/u123/c456/preview/styles.css` |
| `/u123/c456/assets/logo.png` | `/u123/c456/preview/assets/logo.png` |
| `/u123/c456/_next/static/...` | `/u123/c456/preview/_next/static/...` |

This keeps `/preview/` out of the public URL while serving the files from S3.

## Common commands

From the repo root:

```bash
pnpm dev
pnpm build
pnpm lint
pnpm lint:fix
pnpm --filter web typecheck
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter api test:coverage
pnpm --filter api quality:gates
```

## Troubleshooting

- If `apps/api` exits on startup, check Docker first. The sandbox service is initialized during API boot.
- If auth fails locally, verify the GitHub callback URL is exactly `http://localhost:3000/api/auth/callback/github`.
- If migrations fail, confirm `DATABASE_URL` is exported in the same shell session that runs `pnpm --filter @edward/auth db:migrate`.
- If previews or published assets fail, check the AWS, CloudFront, and, for subdomain mode, Cloudflare settings. Placeholder credentials and bucket names do not provide working cloud services.
- If you only need frontend work, run `pnpm --filter web dev`, but auth, API-backed chat, and sandbox flows still require the backend stack for end-to-end testing.

## Notes

- Workspace task orchestration lives in `turbo.json`.
- Package discovery lives in `pnpm-workspace.yaml`.
- Package-specific READMEs are available in `apps/api`, `apps/web`, `packages/auth`, and the configuration packages.
