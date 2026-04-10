## Context

The 1Code desktop app calls ~22 upstream tRPC procedures and ~9 REST endpoints on the dead `1code.dev` backend. The enterprise fork needs a self-hosted replacement. The K8s deployment scaffolding already exists (`deploy/kubernetes/1code-api/`) using the bjw-s app-template Helm chart, with Envoy Gateway SecurityPolicy handling JWT validation and OIDC browser auth.

**Key constraint:** In enterprise mode (`enterpriseAuthEnabled: true`), the desktop app's `auth-manager.ts` disables all OAuth exchange and plan lookup endpoints — it uses MSAL (Entra ID) directly. This means Phase 1 only needs: changelog, plan lookup (via feature flags), profile, and a health endpoint.

**Existing infrastructure:**
- `src/renderer/lib/remote-app-router.ts` — typed tRPC AppRouter stub with 22 procedures across 7 namespaces
- `src/renderer/lib/remote-api.ts` — high-level wrapper for `remoteTrpc.agents.*` and `remoteTrpc.teams.*`
- `deploy/kubernetes/1code-api/` — HelmRelease, HTTPRoute, CiliumNetworkPolicy, SOPS secret, OCIRepository
- `docs/enterprise/upstream-features.md` — F1-F10 feature catalog with file:line references
- Envoy Gateway SecurityPolicy with JWT validation + OIDC redirect already deployed

## Goals / Non-Goals

**Goals:**
- Implement Phase 1 endpoints (changelog, plan, profile, health) as a deployable container
- Match the upstream API contract that the desktop app expects (no client changes needed)
- Use the same tech patterns as the desktop app (TypeScript, Drizzle ORM, tRPC)
- Build and push container images to GHCR via GitHub Actions
- Validate with the existing HelmRelease manifests (no K8s manifest changes beyond placeholder resolution)

**Non-Goals:**
- Phase 2 endpoints (F2 automations, F3 chat sync, F4 voice) — separate OpenSpec changes
- OAuth exchange endpoints — enterprise mode uses MSAL, not OAuth code exchange
- SaaS billing (Stripe) — enterprise deployment uses feature flags, not Stripe subscriptions
- `1code-update-server` — resolved via GitHub Releases provider (dead infrastructure to be removed)

## Decisions

### D1: Service framework — tRPC + Fastify

**Choice:** tRPC server with Fastify HTTP adapter

**Rationale:**
- The desktop app already has a typed `remote-app-router.ts` tRPC stub — the server must match this contract exactly
- Fastify is lightweight, well-tested, and has first-class tRPC support via `@trpc/server/adapters/fastify`
- The REST endpoints (`/api/changelog/desktop`, `/api/desktop/user/plan`) are served as Fastify routes alongside the tRPC router
- Considered: Express (heavier, slower), Hono (newer but less tRPC ecosystem support), plain Node HTTP (too low-level)

### D2: Source location — `services/1code-api/` in the app repo

**Choice:** New `services/` top-level directory in the existing monorepo

**Rationale:**
- Keeps the API contract co-located with the desktop client that consumes it
- Enables type-sharing between `src/renderer/lib/remote-app-router.ts` and the server (future)
- Unified `v*` tag triggers both desktop and container builds
- Considered: separate repo (more isolation but harder to coordinate types and versioning)

### D3: Database — PostgreSQL via Drizzle ORM

**Choice:** PostgreSQL with Drizzle ORM (same as desktop app's SQLite setup)

**Rationale:**
- HelmRelease already declares PostgreSQL as a dependency (`dependsOn` in `ks.yaml`)
- Drizzle ORM is already used in the desktop app — same migration workflow, same query patterns
- Schema is minimal for Phase 1: `users` table, `changelog_entries` table, `user_plans` view (backed by feature flags)
- Considered: SQLite (not suitable for multi-replica server), Prisma (heavier, different migration model)

### D4: Auth — Trust Envoy Gateway JWT validation headers

**Choice:** Read validated JWT claims from Envoy Gateway headers (`x-user-oid`, `x-user-email`, `x-user-name`)

**Rationale:**
- The Envoy Gateway SecurityPolicy at `deploy/kubernetes/envoy-auth-policy/app/securitypolicy.yaml` already validates Entra ID JWTs and injects claims as headers via `claimToHeaders`
- The API server trusts these headers (it's behind the gateway, not directly exposed)
- No JWT validation library needed in the service itself — single responsibility
- For local dev: bypass headers via env flag (same pattern as `MAIN_VITE_DEV_BYPASS_AUTH`)
- Considered: MSAL validation in-service (duplicates gateway work, adds complexity)

### D5: Container build — multi-arch via GitHub Actions

**Choice:** `docker/build-push-action` with Buildx, multi-arch (`linux/amd64,linux/arm64`), push to GHCR

**Rationale:**
- Talos cluster runs both amd64 and arm64 nodes
- GHCR is already used for the bjw-s app-template Helm chart (via OCIRepository)
- Cosign keyless signing via GitHub OIDC (same pattern recommended for desktop SLSA attestation)
- Triggered on same `v*` tag as desktop release — unified versioning

### D6: Changelog source — markdown files in repo

**Choice:** Changelog entries stored as markdown files in `services/1code-api/changelog/` directory, served as JSON

**Rationale:**
- No external CMS dependency
- Entries are version-controlled alongside the code
- Simple: read markdown files, parse frontmatter (date, title, version), return as JSON array
- The desktop app's `agents-help-popover.tsx` expects `?per_page=N` pagination — trivial to implement from a file listing
- Considered: database table (overkill for a read-only feed), GitHub Releases API (coupling to GitHub)

## Risks / Trade-offs

- **[Contract drift]** The `remote-app-router.ts` type stub may drift from the actual server implementation → Mitigation: shared types in a `packages/api-types/` workspace package (Phase 2), integration tests that validate the contract
- **[Phase 2 scope creep]** F2/F3 endpoints are large — risk of expanding Phase 1 scope → Mitigation: strict Phase 1 scope (4 endpoints + health), separate OpenSpec for each F-entry
- **[Gateway dependency]** Auth relies on Envoy Gateway headers — if deployed without the gateway, no auth → Mitigation: optional in-service JWT validation behind a feature flag, documented as a prereq in deploy README
- **[Database migration coordination]** PostgreSQL schema changes need to be coordinated with Flux deployments → Mitigation: Drizzle auto-migration on startup (same pattern as desktop app's SQLite), rollback via previous container image

## Migration Plan

1. **Implement service** — `services/1code-api/` with Phase 1 endpoints
2. **Build container** — `.github/workflows/container-build.yml` pushes to GHCR on `v*` tag
3. **Update HelmRelease** — replace `${IMAGE_REGISTRY}` and `${IMAGE_TAG}` placeholders with GHCR values in cluster-secrets
4. **Deploy via Flux** — add `1code-api/ks.yaml` to cluster repo's namespace kustomization
5. **Point desktop app** — update `getApiBaseUrl()` to return the self-hosted hostname
6. **Verify** — run desktop app against self-hosted API, confirm changelog, plan, profile endpoints work
7. **Rollback** — revert cluster-secrets `IMAGE_TAG` to previous version; Flux reconciles

## Open Questions

1. **Feature flag → plan mapping:** How should the `GET /api/desktop/user/plan` endpoint map feature flags to plan names (`onecode_pro`, `onecode_max_100`, etc.)? Option A: return a fixed plan based on the user's existence in the system (enterprise = max plan). Option B: configurable plan mapping in the API's config.
2. **Changelog format:** Should changelog entries support HTML/markdown rendering, or plain text only? The desktop app renders markdown in the help popover.
3. **Should `deploy/kubernetes/1code-update-server/` be deleted in this change or a separate cleanup?**
