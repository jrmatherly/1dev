## 1. Project Scaffolding

- [x] 1.1 Create `services/1code-api/` directory structure: `src/`, `src/routes/`, `src/trpc/`, `src/db/`, `changelog/`, `tests/`
- [x] 1.2 Initialize `services/1code-api/package.json` with dependencies: `fastify`, `@trpc/server`, `@trpc/server/adapters/fastify`, `drizzle-orm`, `pg`, `zod`
- [x] 1.3 Create `services/1code-api/tsconfig.json` with strict mode, ESM target, path aliases
- [x] 1.4 Create `services/1code-api/src/index.ts` — Fastify server entry point with graceful shutdown
- [x] 1.5 Create `services/1code-api/src/config.ts` — environment variable parsing with Zod validation (PORT, DATABASE_URL, DEV_BYPASS_AUTH, LOG_LEVEL)

## 2. Auth Middleware

- [ ] 2.1 Create `services/1code-api/src/auth.ts` — extract user identity from Envoy Gateway headers (`x-user-oid`, `x-user-email`, `x-user-name`)
- [ ] 2.2 Implement dev bypass mode: when `DEV_BYPASS_AUTH=true`, use a default dev user identity without requiring gateway headers
- [ ] 2.3 Create Fastify `onRequest` hook that attaches user context to the request (or returns 401 for unauthenticated requests)
- [ ] 2.4 Write tests for auth middleware: gateway headers present, missing headers in prod, dev bypass mode

## 3. Database Schema

- [ ] 3.1 Create `services/1code-api/src/db/schema.ts` — Drizzle schema for PostgreSQL: `users` table (oid PK, email, display_name, created_at, updated_at)
- [ ] 3.2 Create `services/1code-api/src/db/connection.ts` — PostgreSQL connection pool with Drizzle ORM
- [ ] 3.3 Create `services/1code-api/drizzle.config.ts` — Drizzle Kit config pointing to PostgreSQL
- [ ] 3.4 Generate initial migration: `cd services/1code-api && npx drizzle-kit generate`
- [ ] 3.5 Implement auto-migration on startup (same pattern as desktop app's `src/main/lib/db/index.ts`)

## 4. Health Endpoint

- [ ] 4.1 Create `services/1code-api/src/routes/health.ts` — `GET /health` that verifies database connectivity
- [ ] 4.2 Return `{ "status": "ok" }` (200) when healthy, `{ "status": "unhealthy", "reason": "database" }` (503) when DB is down
- [ ] 4.3 Register health route in Fastify (no auth required — K8s probes don't send gateway headers)
- [ ] 4.4 Write tests for health endpoint: healthy DB, unreachable DB

## 5. Changelog Endpoint

- [ ] 5.1 Create `services/1code-api/changelog/` directory with a sample changelog entry markdown file (YAML frontmatter: title, date, version + markdown body)
- [ ] 5.2 Create `services/1code-api/src/routes/changelog.ts` — `GET /api/changelog/desktop` that reads markdown files from `changelog/`, parses frontmatter, returns JSON array sorted by date descending
- [ ] 5.3 Implement `per_page` query parameter (default: 10, max: 50)
- [ ] 5.4 Write tests for changelog endpoint: multiple entries sorted, per_page limit, empty directory

## 6. User Plan Endpoint

- [ ] 6.1 Create `services/1code-api/src/routes/plan.ts` — `GET /api/desktop/user/plan` that returns `{ email, plan, status }` for the authenticated user
- [ ] 6.2 Implement enterprise plan resolution: all authenticated users get `{ plan: "onecode_max", status: "active" }` with email from gateway headers
- [ ] 6.3 Write tests for plan endpoint: enterprise user gets max plan, unauthenticated returns 401

## 7. User Profile Endpoint

- [ ] 7.1 Create `services/1code-api/src/routes/profile.ts` — `PATCH /api/user/profile` that accepts `{ display_name }` and updates the users table
- [ ] 7.2 Implement upsert: create user record if first request (from gateway headers), update display_name on subsequent requests
- [ ] 7.3 Return the full user object after update (oid, email, display_name, created_at, updated_at)
- [ ] 7.4 Write tests for profile endpoint: first-time user creation, display name update, missing display_name field

## 8. Dockerfile and Container Build

- [ ] 8.1 Create `services/1code-api/Dockerfile` — multi-stage build: `bun install` → `bun build` → distroless/node runtime image
- [ ] 8.2 Add `.dockerignore` for `services/1code-api/` (node_modules, tests, changelog dev files)
- [ ] 8.3 Test local build: `docker build -t 1code-api:local -f services/1code-api/Dockerfile .`
- [ ] 8.4 Test local run: `docker run -p 8000:8000 -e DEV_BYPASS_AUTH=true 1code-api:local` and verify health endpoint

## 9. GitHub Actions Container Build Workflow

- [ ] 9.1 Create `.github/workflows/container-build.yml` — triggered on `v*` tag push and `workflow_dispatch`
- [ ] 9.2 Configure `docker/build-push-action` with multi-arch (`linux/amd64,linux/arm64`), GHCR push, GHA cache
- [ ] 9.3 Add `docker/metadata-action` for semver + SHA tagging
- [ ] 9.4 Add Cosign keyless signing step (sigstore/cosign-installer + `cosign sign --oidc-provider github-actions`)
- [ ] 9.5 Enable SLSA provenance and SBOM (`provenance: true, sbom: true` in build-push-action)
- [ ] 9.6 Verify workflow runs on test tag (e.g., `v0.0.76-rc.1`) — container appears in GHCR

## 10. K8s Manifest Updates

- [ ] 10.1 Update `deploy/kubernetes/1code-api/app/helmrelease.yaml` — document that `${IMAGE_REGISTRY}` resolves to `ghcr.io/jrmatherly` and `${IMAGE_TAG}` resolves to the release tag
- [ ] 10.2 Delete `deploy/kubernetes/1code-update-server/` directory (dead infrastructure — F5 resolved via GitHub Releases)
- [ ] 10.3 Update `deploy/README.md` — remove 1code-update-server from components table, add container build instructions
- [ ] 10.4 Update `docs/operations/roadmap.md` — move K8s container build entry to Recently Completed

## 11. Integration Verification

- [ ] 11.1 Run all 5 quality gates: `bun run ts:check`, `bun run build`, `bun test`, `bun audit`, `cd docs && bun run build`
- [ ] 11.2 Verify the container image is accessible in GHCR: `docker pull ghcr.io/jrmatherly/1code-api:v0.0.XX`
- [ ] 11.3 Document deployment steps in `services/1code-api/README.md` — local dev, Docker, Kubernetes

## 12. Documentation Updates

- [ ] 12.1 Update `CLAUDE.md` — add `services/1code-api/` to working directories, mention container build workflow
- [ ] 12.2 Update `.claude/PROJECT_INDEX.md` — add services directory
- [ ] 12.3 Update `docs/architecture/codebase-layout.md` — add services layer
- [ ] 12.4 Update `docs/operations/roadmap.md` — mark Phase 1 of K8s manifest CI + container pipeline as complete
- [ ] 12.5 Update `.serena/memories/` — sync project overview and codebase structure
