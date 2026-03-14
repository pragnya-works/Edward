# Edward

Edward is an AI-assisted web app builder. The product combines a Next.js frontend, an Express API, a background worker, and Docker-backed sandboxes so a user can describe a product in chat, generate code, iterate on files, preview the result, and sync work back to GitHub.

## Product Demo

<p align="center">
  <a href="https://www.youtube.com/watch?v=zIBuOmr92_s">
    <img src="https://img.youtube.com/vi/zIBuOmr92_s/hqdefault.jpg" alt="Watch the demo" width="700" />
  </a>
</p>

## What This Repo Contains

- `apps/web`: Next.js 16 app-router frontend, auth routes, chat UI, preview UI, changelog UI
- `apps/api`: Express API, BullMQ workers, sandbox orchestration, build pipeline, run streaming
- `packages/auth`: Better Auth setup, Drizzle schema, shared DB access
- `packages/shared`: shared types, schemas, stream event contracts
- `packages/ui`: shared UI primitives and styles
- `packages/octokit`: GitHub sync helpers
- `packages/eslint-config` and `packages/typescript-config`: workspace tooling presets

## Architecture In One Pass

- The web app runs on `http://localhost:3000`.
- The API runs on `http://localhost:8000`.
- The API worker processes build and agent jobs from Redis-backed BullMQ queues.
- Postgres stores users, chats, runs, builds, and auth data.
- Docker is required locally because sandbox sessions and generated-app builds depend on containerized execution.
- Users authenticate with GitHub and then provide their own model API key inside the app for OpenAI or Gemini-backed generation.

## Prerequisites

- Node.js `20+`
- `pnpm` `10.4.1` or compatible `10.x`
- Docker Desktop or another local Docker runtime
- Postgres `15+` or `16+`
- Redis `7+`
- A GitHub OAuth app for local sign-in

Recommended bootstrap:

```bash
corepack enable
corepack prepare pnpm@10.4.1 --activate
pnpm install
```

## Local Setup

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

Set these values first because they are the baseline needed for local development.

#### `apps/web/.env.local`

```bash
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
NEXT_PUBLIC_API_URL="http://localhost:8000"
NEXT_PUBLIC_BETTER_AUTH_URL="http://localhost:3000"
DATABASE_URL="postgresql://postgres:password@localhost:5432/edward"
BETTER_AUTH_SECRET="<generate-a-secret>"
BETTER_AUTH_URL="http://localhost:3000"
GITHUB_CLIENT_ID="<github-client-id>"
GITHUB_CLIENT_SECRET="<github-client-secret>"
NEXT_PUBLIC_ASSETS_URL="https://assets.yourdomain.com"
NEXT_PUBLIC_CDN_URL=""
LINEAR_API_KEY=""
NEXT_PUBLIC_SENTRY_DSN=""
SENTRY_AUTH_TOKEN=""
```

#### `apps/api/.env`

```bash
EDWARD_API_PORT=8000
NODE_ENV="development"
CORS_ORIGIN="http://localhost:3000"
DATABASE_URL="postgresql://postgres:password@localhost:5432/edward"
BETTER_AUTH_SECRET="<same-secret-as-web>"
BETTER_AUTH_URL="http://localhost:3000"
GITHUB_CLIENT_ID="<github-client-id>"
GITHUB_CLIENT_SECRET="<github-client-secret>"
ENCRYPTION_KEY="<64-char-hex-key>"
REDIS_URL="redis://localhost:6379"
REDIS_HOST="localhost"
REDIS_PORT=6379
DOCKER_REGISTRY_BASE="ghcr.io/your-org/edward"
PREWARM_SANDBOX_IMAGE="node:20-slim"
EDWARD_DEPLOYMENT_TYPE="path"
TRUST_PROXY="false"
AWS_REGION="us-east-1"
AWS_BUCKET_NAME="edward-sandbox"
AWS_CDN_BUCKET_NAME="edward-cdn"
AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""
ASSETS_URL=""
CLOUDFRONT_DISTRIBUTION_URL=""
CLOUDFRONT_DISTRIBUTION_ID=""
CLOUDFLARE_API_TOKEN=""
CLOUDFLARE_ACCOUNT_ID=""
CLOUDFLARE_KV_NAMESPACE_ID=""
PREVIEW_ROOT_DOMAIN=""
SENTRY_DSN=""
TAVILY_API_KEY=""
```

Useful generators:

```bash
openssl rand -base64 32
openssl rand -hex 32
```

Use the base64 output for `BETTER_AUTH_SECRET` and the hex output for `ENCRYPTION_KEY`.

### 4. Run database migrations

`drizzle-kit` in `packages/auth` does not load a package-local `.env` automatically. Export `DATABASE_URL` in your shell before running migrations:

```bash
export DATABASE_URL="postgresql://postgres:password@localhost:5432/edward"
pnpm --filter @edward/auth db:migrate
```

### 5. Prepare sandbox images if needed

If the API cannot pull sandbox images or you want local template images available up front, build them once:

```bash
./scripts/build-local-sandboxes.sh
```

This builds the sandbox images defined under `docker/templates/*`.

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
- Add your OpenAI or Gemini API key in the product UI.
- Start a chat and generate a project.

## Required Vs Optional Integrations

Required for app + worker boot:

- Postgres
- Redis
- Docker
- GitHub OAuth
- `AWS_BUCKET_NAME` and `AWS_CDN_BUCKET_NAME` placeholders in `apps/api/.env`

Required for full preview/deploy parity:

- Real AWS credentials and S3 / CloudFront values
- Cloudflare preview-routing values
- A real assets host for `NEXT_PUBLIC_ASSETS_URL` / `ASSETS_URL`

Optional:

- `LINEAR_API_KEY` for changelog integration
- `TAVILY_API_KEY` for web search
- `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` for error reporting

## CloudFront Setup (For Preview Routing)

If you want preview URLs to work with CloudFront (e.g., `https://yourdomain.com/userid/chatid`), you need to deploy a CloudFront Function that rewrites requests to the `/preview/` folder.

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

### 2. Associate with Your Distribution

1. Go to your CloudFront Distribution → Functions tab
2. Click **Associate function**
3. Choose:
   - **Event type:** Viewer request
   - **Function:** `edward-preview-rewrite` (or your function name)
4. Save changes

### 3. Update Environment Variables

In `apps/api/.env`, set:

```bash
CLOUDFRONT_DISTRIBUTION_ID="<your-distribution-id>"
CLOUDFRONT_DISTRIBUTION_URL="https://<your-distribution-id>.cloudfront.net"
```

### How It Works

The function rewrites incoming requests so that:

| Incoming URL | Rewritten To |
|--------------|--------------|
| `/u123/c456` | `/u123/c456/preview/index.html` |
| `/u123/c456/` | `/u123/c456/preview/index.html` |
| `/u123/c456/styles.css` | `/u123/c456/preview/styles.css` |
| `/u123/c456/assets/logo.png` | `/u123/c456/preview/assets/logo.png` |
| `/u123/c456/_next/static/...` | `/u123/c456/preview/_next/static/...` |

This allows clean preview URLs like `https://yourdomain.com/userid/chatid` while serving files from the `/preview/` subdirectory in S3.

## Common Commands

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
- If previews or published assets fail, your AWS / CloudFront / Cloudflare settings are either missing or intentionally stubbed. The app can still be developed locally, but those flows will not be production-complete.
- If you only need frontend work, run `pnpm --filter web dev`, but auth, API-backed chat, and sandbox flows still require the backend stack for end-to-end testing.

## Notes

- Workspace task orchestration lives in `turbo.json`.
- Package discovery lives in `pnpm-workspace.yaml`.
- Each app/package has its own README for package-specific details.
