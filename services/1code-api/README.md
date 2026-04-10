# 1code-api

Self-hosted backend API replacing the upstream `1code.dev` SaaS. Provides endpoints consumed by the 1Code desktop Electron app.

## Phase 1 Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | K8s liveness/readiness probe (checks DB connectivity) |
| GET | `/api/changelog/desktop` | Yes | Changelog feed from markdown files |
| GET | `/api/desktop/user/plan` | Yes | Enterprise plan resolution (all users → `onecode_max`) |
| PATCH | `/api/user/profile` | Yes | Update user display name (upsert) |

## Local Development

```bash
# Install dependencies
bun install

# Set required env vars
export DATABASE_URL="postgresql://localhost:5432/onecode"
export DEV_BYPASS_AUTH=true

# Run with hot reload
bun run dev

# Run tests
bun test
```

## Docker

```bash
# Build
docker build -t 1code-api:local .

# Run with dev bypass (no database needed for changelog/plan endpoints)
docker run -p 8000:8000 \
  -e DEV_BYPASS_AUTH=true \
  -e DATABASE_URL="postgresql://host.docker.internal:5432/onecode" \
  1code-api:local

# Verify
curl http://localhost:8000/health
curl http://localhost:8000/api/changelog/desktop
```

## Kubernetes

The service deploys via Flux v2 using the HelmRelease at `deploy/kubernetes/1code-api/`.

Container images are built by `.github/workflows/container-build.yml` on `v*` tag push and published to `ghcr.io/jrmatherly/1code-api`.

See `deploy/README.md` for placeholder variable documentation.

## Auth Model

In production, Envoy Gateway validates Entra ID JWTs and injects claims as headers:
- `x-user-oid` — Azure AD object ID
- `x-user-email` — user email
- `x-user-name` — display name

The API trusts these headers unconditionally (it's behind the gateway). Set `DEV_BYPASS_AUTH=true` for local development without the gateway.

## Database

PostgreSQL via Drizzle ORM. Migrations run automatically on startup.

```bash
# Generate migration after schema change
bun run db:generate

# Open Drizzle Studio
bun run db:studio
```
