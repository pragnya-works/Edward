# Production Compose Stack

This stack runs the full Edward runtime (`web`, `api`, `worker`, `redis`, `postgres`) for production-style environments.

## Requirements

- Docker Engine + Docker Compose plugin
- Built/published container images for:
  - `API_IMAGE` (contains `apps/api/dist`)
  - `WEB_IMAGE` (contains Next.js production server)
- Host Docker socket access only if sandboxing is enabled (`SANDBOX_ENABLED=true`)
  - Security warning: mounting `/var/run/docker.sock` gives container code host-level Docker control. Enable only on trusted hosts.

## Required environment

Set these shell variables before startup:

```bash
export API_IMAGE=ghcr.io/your-org/edward-api:sha-<commit>
export WEB_IMAGE=ghcr.io/your-org/edward-web:sha-<commit>
export POSTGRES_USER=edward
export POSTGRES_PASSWORD=change-me
export POSTGRES_DB=edward
```

Create:

- `apps/api/.env.production`
- `apps/web/.env.production`
- In `apps/web/.env.production`, set `INTERNAL_API_URL=http://api:8000` for reliable in-cluster readiness checks.

Then run:

```bash
docker compose -f docker/compose.production.yml up -d
```

If sandbox is enabled, include the socket-mount override:

```bash
docker compose \
  -f docker/compose.production.yml \
  -f docker/compose.production.sandbox.yml \
  up -d
```

## Health endpoints

- API readiness: `http://<host>:8000/ready`
- Web readiness: `http://<host>:3000/api/ready`
