## Why

The 1Code desktop app was forked from an upstream SaaS (`1code.dev`) that provided a backend API for auth exchange, user plans, changelog, voice transcription, agent chat sync, and automations. That backend is dead. The Electron app currently calls these endpoints via `remoteTrpc.*` and raw `fetch()` — all returning errors. The `1code-api` Kubernetes manifests already exist (`deploy/kubernetes/1code-api/`) but reference container images that have never been built because the service source code does not exist. This change implements the self-hosted replacement backend, starting with the endpoints needed for enterprise deployment.

## What Changes

- **New service:** `services/1code-api/` — a TypeScript/Node.js tRPC + Fastify server implementing the subset of upstream endpoints required by the desktop app
- **New Dockerfile:** `services/1code-api/Dockerfile` — multi-stage build for the API container image
- **New CI workflow:** `.github/workflows/container-build.yml` — builds multi-arch container images and pushes to GHCR on `v*` tags
- **Phase 1 endpoints (enterprise-critical):**
  - `GET /api/changelog/desktop` — changelog feed (F6)
  - `GET /api/desktop/user/plan` — subscription plan lookup via feature flags (F8)
  - `PATCH /api/user/profile` — profile update (F8)
  - Health check (`GET /health`) for K8s probes
- **Phase 2 endpoints (deferred — requires additional design):**
  - tRPC `agents.*` procedures — cloud chat sync (F3)
  - tRPC `automations.*` / `github.*` / `linear.*` — automations backend (F2)
  - `POST /api/voice/transcribe` — Whisper proxy (F4)
  - OAuth exchange endpoints (F8 SaaS mode — not needed for enterprise)
- **Remove dead infrastructure:** `deploy/kubernetes/1code-update-server/` — F5 is resolved via GitHub Releases; the update server K8s manifests are unused

## Capabilities

### New Capabilities
- `self-hosted-api`: Self-hosted backend API service replacing the upstream `1code.dev` SaaS — covers service architecture, endpoint contracts, database schema, auth integration, and container packaging

### Modified Capabilities
- `feature-flags`: Existing feature flag infrastructure gains a server-side plan lookup endpoint that maps flags to subscription tiers

## Impact

- **New directory:** `services/1code-api/` (source code, Dockerfile, tests)
- **New workflow:** `.github/workflows/container-build.yml`
- **Deleted directory:** `deploy/kubernetes/1code-update-server/` (dead infrastructure)
- **Modified files:** `deploy/kubernetes/1code-api/app/helmrelease.yaml` (placeholder → real image values)
- **Dependencies:** Adds `fastify`, `@trpc/server`, `drizzle-orm`, `pg` to the service (not the Electron app)
- **Database:** PostgreSQL (already a prereq in the HelmRelease, uses Drizzle ORM for consistency with desktop app)
- **Auth:** Validates Entra ID JWTs (same tokens the Envoy Gateway SecurityPolicy validates) — no new auth mechanism
