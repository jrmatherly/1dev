# Codebase Structure

## Top-Level
```
src/           — Application source code
docs/          — Canonical xyd-js documentation site (Operations tab has roadmap)
deploy/        — K8s Flux v2 manifests: 1code-api, 1code-update-server, envoy-auth-policy (all ${PLACEHOLDER})
openspec/      — OpenSpec change proposals + 9 capability specs
.claude/rules/ — 9 behavioral rules (2 global + 7 path-scoped)
.claude/skills/ — Workflow skills (roadmap-tracker, phase-0-progress, docs-drift-check, etc.)
.claude/agents/ — Subagents (db-schema-auditor, trpc-router-auditor, etc.)
tests/regression/ — 14 bun:test regression guards, 58 tests
drizzle/       — 9 database migration files
```

## Main Process (`src/main/`)
- `auth-manager.ts` — Strangler Fig adapter: branches on `enterpriseAuthEnabled` flag, delegates to EnterpriseAuth (MSAL) or legacy AuthStore. `ensureReady()` for lazy async MSAL init.
- `lib/credential-store.ts` — Unified 3-tier credential encryption
- `lib/enterprise-auth.ts` — MSAL Node Entra token acquisition (wired into auth-manager)
- `lib/terminal/session.ts` — **Lazy import** for node-pty (prevents crash if native module fails)
- `lib/db/schema/index.ts` — Drizzle schema (7 tables, incl. feature_flag_overrides)
- `lib/trpc/routers/index.ts` — 22 routers in `createAppRouter` (incl. enterprise-auth)
- `lib/trpc/routers/enterprise-auth.ts` — Enterprise auth tRPC router (signIn/signOut/getStatus/refreshToken)
- `lib/feature-flags.ts` — Type-safe feature flags backed by DB table
- `electron.vite.config.ts` — Uses `build.externalizeDeps` (electron-vite 5.0 API)

## Renderer (`src/renderer/`)
- `login.html` — Pre-auth sign-in screen (1Code logo, static HTML)
- `lib/mock-api.ts` — Phase 2 complete: 655 → 144 lines, F-entry stubs only (remaining upstream SaaS surface)
- `lib/message-parser.ts` — 5-stage tool normalization pipeline extracted during mock-api Phase 2 migration
- `lib/remote-trpc.ts` — Upstream tRPC client (F-entry boundary)
- `features/agents/stores/sub-chat-store.ts` — No persist middleware; rebuilt from DB

## Documentation Site (`docs/`)
- `docs.json` — xyd-js config (5 tabs, operations tab includes roadmap)
- `operations/roadmap.md` — **Single source of truth** for outstanding work
- Build: `cd docs && bun run build` (cleans .xyd/ artifacts first)

## OpenSpec Specs (9 capabilities)
brand-identity, feature-flags, claude-code-auth-import, documentation-site,
credential-storage, renderer-data-access, enterprise-auth, enterprise-auth-wiring, electron-runtime

## Active OpenSpec Changes (3)
upgrade-electron-41 (26/27, committed+pushed), upgrade-tailwind-4 (54/64, Section 8 visual QA pending),
upgrade-vite-8-build-stack
(upgrade-typescript-6 archived 2026-04-10)

## IDE Configuration
.vscode/settings.json — tracked in git (`.gitignore` uses `!.vscode/settings.json`).
Contains: tsgo native preview flag, SonarLint rule suppressions (5 rules
disabled project-wide: S6478, S7764, S7781, S7735, S3358).

## Regression Tests (14 guards, 58 tests across 14 files)
auth-get-token-deleted, token-leak-logs-removed, credential-manager-deleted,
gpg-verification-present, feature-flags-shape, brand-sweep-complete,
no-upstream-sandbox-oauth, no-scratchpad-references, mock-api-no-snake-timestamps,
credential-storage-tier, enterprise-auth-module, enterprise-auth-wiring, electron-version-pin,
mock-api-consumer-migration
