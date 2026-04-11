# Codebase Structure

## Top-Level
```
src/           — Application source code
docs/          — Canonical xyd-js documentation site (Operations tab has roadmap)
deploy/        — K8s Flux v2 manifests: 1code-api, envoy-auth-policy (all ${PLACEHOLDER}). 1code-update-server DELETED (F5 resolved via GitHub Releases).
openspec/      — OpenSpec change proposals + 12 capability specs (85 requirements)
.claude/rules/ — 9 behavioral rules (2 global + 7 path-scoped)
.claude/skills/ — 17 workflow skills incl. `project-orchestrator` (routing + hard-rule gate, added 2026-04-11), roadmap-tracker, phase-0-progress, docs-drift-check, session-sync, 6 openspec-* skills, new-router, new-regression-guard, release, upstream-boundary-check, verify-strategy-compliance, verify-pin
.claude/agents/ — Subagents (db-schema-auditor, trpc-router-auditor, etc.)
tests/regression/ — 15 bun:test regression guards
drizzle/       — Database migration files
services/1code-api/ — Backend API service (Fastify+tRPC+Drizzle/PostgreSQL). 20 test files (Phase 1 baseline: health, changelog, plan, profile, auth, config; LiteLLM provisioning: lib/{graph-client,slugify,teams-config,litellm-client}, routes/{keys,provision,rate-limit-keygenerator}, services/{key-service,provisioning,rotation,deprovisioning}, 3 integration tests skipped without docker-compose). `add-1code-api-litellm-provisioning` archived 2026-04-11.
.github/workflows/container-build.yml — Container build: multi-arch (amd64+arm64), GHCR push, Cosign signing, SLSA provenance
```

## Main Process (`src/main/`)
- `auth-manager.ts` — Strangler Fig adapter: branches on `enterpriseAuthEnabled` flag, delegates to EnterpriseAuth (MSAL) or legacy AuthStore. `ensureReady()` for lazy async MSAL init.
- `lib/credential-store.ts` — Unified 3-tier credential encryption
- `lib/enterprise-auth.ts` — MSAL Node Entra token acquisition (wired into auth-manager)
- `lib/terminal/session.ts` — **Lazy import** for node-pty (prevents crash if native module fails)
- `lib/db/schema/index.ts` — Drizzle schema (7 tables: projects, chats, subChats, claudeCodeCredentials, anthropicAccounts, anthropicSettings, featureFlagOverrides)
- `lib/trpc/routers/index.ts` — 22 routers in `createAppRouter` (21 feature routers + `createGitRouter()` for the git changes router). Current list: projects, chats, claude, claudeCode, claudeSettings, anthropicAccounts, ollama, codex, terminal, external, files, debug, skills, agents, worktreeConfig, sandboxImport, commands, voice, plugins, featureFlags, enterpriseAuth + git.
- `lib/trpc/routers/enterprise-auth.ts` — Enterprise auth tRPC router (signIn/signOut/getStatus/refreshToken)
- `lib/trpc/routers/codex.ts` — `CodexMcpServerForSettings` type now has optional `serverInfo?`/`error?` fields aligning with Claude's `MCPServer` shape (added 2026-04-11 in baseline-reduction sweep)
- `lib/trpc/routers/{commands,plugins,skills}.ts` + `lib/trpc/routers/agent-utils.ts` — **upcoming** import change under `replace-gray-matter-with-front-matter`: 8 `import matter from "gray-matter"` call sites will swap to `import { matter } from "../../frontmatter"` pointing at a new `src/main/lib/frontmatter.ts` canonical shim. Empirically validated via in-tree spike.
- `lib/feature-flags.ts` — Type-safe feature flags backed by DB table
- `electron.vite.config.ts` — Uses `build.externalizeDeps` (electron-vite 5.0 API). Current exclude list: `["superjson", "trpc-electron", "gray-matter", "async-mutex"]`. Will swap `gray-matter` → `front-matter` under `replace-gray-matter-with-front-matter`.
- `index.ts` line ~908 — `app.dock?.setMenu(dockMenu)` uses optional chaining (macOS-only API)

## Renderer (`src/renderer/`)
- `login.html` — Pre-auth sign-in screen (1Code logo, static HTML)
- `lib/mock-api.ts` — Phase 2 complete: 655 → 144 lines, F-entry stubs only (remaining upstream SaaS surface)
- `lib/message-parser.ts` — 5-stage tool normalization pipeline extracted during mock-api Phase 2 migration
- `lib/remote-trpc.ts` — Upstream tRPC client (F-entry boundary)
- `features/agents/stores/sub-chat-store.ts` — No persist middleware; rebuilt from DB
- `features/agents/ui/agent-diff-view.tsx` — `sandboxId: string | null | undefined` (was `string`), `repository?: string` (flat, was `{owner, name} | null` in Renderer variant). Unified prop shape across `AgentDiffView` + `DiffSidebarContentProps` + `DiffSidebarRendererProps` on 2026-04-11.
- `features/agents/context/text-selection-context.tsx` — **Polyfill deleted** 2026-04-11. `Selection.getComposedRanges` is now in lib.dom.d.ts so the declaration-merging block was causing TS2300/TS2386.
- `features/agents/ui/agents-content.tsx` — Desktop-mock `useSearchParams`/`useRouter`/`useClerk` stubs now have proper arg signatures (still no-ops at runtime).

## Documentation Site (`docs/`)
- `docs.json` — xyd-js config (5 tabs, operations tab includes roadmap)
- `operations/roadmap.md` — **Single source of truth** for outstanding work
- Build: `cd docs && bun run build` (cleans .xyd/ artifacts first)

## OpenSpec Specs (12 capabilities, 85 requirements as of 2026-04-11)
1code-api-litellm-provisioning (19), brand-identity (11), claude-code-auth-import (2), credential-storage (7), documentation-site (5), electron-runtime (4), enterprise-auth (5), enterprise-auth-wiring (4), feature-flags (6), renderer-data-access (5), self-hosted-api (11), shiki-highlighter (6). **Expected at next archive**: `frontmatter-parsing` (6 requirements / 15 scenarios) from `replace-gray-matter-with-front-matter`.

## Active OpenSpec Changes (2 as of 2026-04-11 session-sync)
- `replace-gray-matter-with-front-matter` (0/67, proposed 2026-04-11 commit `b6187fb`) — scaffolded with full 4-artifact proposal (proposal.md, design.md, specs/frontmatter-parsing/spec.md, tasks.md). Worktree-mandatory implementation per `tasks.md` §1 + §13.
- `upgrade-vite-8-build-stack` (15/50, Phase A done, Phase B blocked on electron-vite 6.0.0 stable)

## Recently Archived (2026-04-10 + 2026-04-11)
- `2026-04-11-upgrade-electron-41` (26/27 — task 5.3 packaged-build auto-updater verification deferred as a roadmap item, blocked on code-signing)
- `2026-04-11-add-1code-api-litellm-provisioning` (77/77 complete — NEW baseline spec `1code-api-litellm-provisioning` with 19 requirements)
- `2026-04-10-implement-1code-api`
- `2026-04-10-upgrade-shiki-4`
- `2026-04-10-upgrade-tailwind-4`
- `2026-04-10-upgrade-typescript-6`

## IDE Configuration
.vscode/settings.json — tracked in git (`.gitignore` uses `!.vscode/settings.json`).
Contains: tsgo native preview flag, SonarLint rule suppressions (50 rules
disabled project-wide — grew from 16 during 2026-04-10 remediation session).

## Regression Tests (15 guards)
auth-get-token-deleted, token-leak-logs-removed, credential-manager-deleted,
gpg-verification-present, feature-flags-shape, brand-sweep-complete,
no-upstream-sandbox-oauth, no-scratchpad-references, mock-api-no-snake-timestamps,
credential-storage-tier, enterprise-auth-module, enterprise-auth-wiring, electron-version-pin,
mock-api-consumer-migration, and one 1code-api single-replica regression guard.

Two additional guards are **planned but not yet added** under `replace-gray-matter-with-front-matter`: `no-gray-matter.test.ts` (regression guard) and `frontmatter-shim-shape.test.ts` (unit test).

Combined `bun test` total: **199 tests across 35 files** (189 pass + 10 skipped integration tests, 0 fail, ~7.6s) — `services/1code-api/tests/integration/` contains 3 integration tests that skip without a docker-compose harness.
