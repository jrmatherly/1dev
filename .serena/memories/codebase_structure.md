# Codebase Structure

## Top-Level
```
src/           — Application source code
docs/          — Canonical xyd-js documentation site (Operations tab has roadmap)
deploy/        — K8s Flux v2 manifests: 1code-api, envoy-auth-policy (all ${PLACEHOLDER}). 1code-update-server DELETED (F5 resolved via GitHub Releases).
openspec/      — OpenSpec change proposals + 15 capability specs (109 requirements)
.claude/rules/ — 9 behavioral rules (2 global + 7 path-scoped)
.claude/skills/ — 17 workflow skills incl. `project-orchestrator` (routing + hard-rule gate, added 2026-04-11), roadmap-tracker, phase-0-progress, docs-drift-check, session-sync, 6 openspec-* skills, new-router, new-regression-guard, release, upstream-boundary-check, verify-strategy-compliance, verify-pin
.claude/agents/ — Subagents (db-schema-auditor, trpc-router-auditor, etc.)
tests/regression/ — 25 bun:test files (24 regression guards + 1 frontmatter shim unit test)
tests/fixtures/   — Test fixtures (sample-agent.md added 2026-04-12 for frontmatter shim test)
drizzle/       — Database migration files
services/1code-api/ — Backend API service (Fastify+tRPC+Drizzle/PostgreSQL). 20 test files (Phase 1 baseline: health, changelog, plan, profile, auth, config; LiteLLM provisioning: lib/{graph-client,slugify,teams-config,litellm-client}, routes/{keys,provision,rate-limit-keygenerator}, services/{key-service,provisioning,rotation,deprovisioning}, 3 integration tests skipped without docker-compose). `add-1code-api-litellm-provisioning` archived 2026-04-11.
.github/workflows/container-build.yml — Container build: multi-arch (amd64+arm64), GHCR push, Cosign signing, SLSA provenance
```

## Main Process (`src/main/`)
- `auth-manager.ts` — Strangler Fig adapter: branches on `enterpriseAuthEnabled` flag, delegates to EnterpriseAuth (MSAL) or legacy AuthStore. `ensureReady()` for lazy async MSAL init.
- `lib/credential-store.ts` — Unified 3-tier credential encryption
- `lib/safe-external.ts` — **Scheme-validated `safeOpenExternal()` wrapper** (added 2026-04-12 via PR #17). All `shell.openExternal()` calls MUST go through this module — validates URL scheme to `https:`/`http:`/`mailto:` only. Enforced by `tests/regression/open-external-scheme.test.ts`.
- `lib/safe-json-parse.ts` — **Typed `safeJsonParse<T>()` utility** (added 2026-04-12 Phase C §8.1). Returns `T | null` on parse/validator failure. Applied to 8 DB-content deserialization sites in chats.ts (6), claude.ts, auth-store.ts.
- `lib/frontmatter.ts` — **Canonical frontmatter parser shim** (added 2026-04-12). Wraps `front-matter@4.0.2` and re-exports as `{ data, content }` shape. Enforced by `tests/regression/no-gray-matter.test.ts`.
- `lib/claude/` — **Phase C §7 decomposition 2026-04-12** — extracted from `trpc/routers/claude.ts`:
  - `prompt-parser.ts` (97 lines) — `parseMentions()` for @[agent:/skill:/file:/folder:/tool:] mention parsing + hint injection
  - `session-manager.ts` (59 lines) — `activeSessions` Map, `pendingToolApprovals` Map, `PLAN_MODE_BLOCKED_TOOLS` Set, `hasActiveClaudeSessions()`, `abortAllClaudeSessions()`, `clearPendingApprovals()`. Consumed by index.ts + windows/main.ts for reload coordination.
  - `mcp-resolver.ts` (528 lines) — `workingMcpServers`, `symlinksCreated`, `mcpConfigCache`, `projectMcpJsonCache`, `mcpCacheKey()`, `readProjectMcpJsonCached()`, `clearMcpResolverCaches()`, `getServerStatusFromConfig()`, `fetchToolsForServer()`, `getAllMcpConfigHandler()`. Aggregates MCP configs across global/project/plugin scopes and probes liveness.
  - `tool-executor.ts` (240 lines) — `createCanUseTool(ctx)` factory returning the canUseTool async callback passed to `claudeQuery()`. Captures `isUsingOllama`, `mode`, `subChatId`, `safeEmit`, `parts` from request scope. Handles Ollama parameter normalization, plan-mode guardrails, AskUserQuestion approval flow.
  - Pre-existing: `env.ts`, `index.ts`, `offline-handler.ts`, `raw-logger.ts`, `transform.ts`, `types.ts`
  - `trpc/routers/claude.ts` is now **2,503 lines** (down from 3,309, −24%). Residual bulk is the 2,003-line chat subscription handler; further decomposition deferred to P3 roadmap.
- `global.d.ts` — **NEW 2026-04-12 Phase C §8.7** — NodeJS.Global augmentation for runtime-bolted properties (__devToolsUnlocked, __unlockDevTools, __setUpdateAvailable). Eliminates all `(global as any).__xyz` escape hatches in windows/main.ts, auto-updater.ts, index.ts.
- `lib/enterprise-auth.ts` — MSAL Node Entra token acquisition (wired into auth-manager)
- `lib/terminal/session.ts` — **Lazy import** for node-pty (prevents crash if native module fails)
- `lib/db/schema/index.ts` — Drizzle schema (7 tables: projects, chats, subChats, claudeCodeCredentials, anthropicAccounts, anthropicSettings, featureFlagOverrides)
- `lib/trpc/index.ts` — **`authedProcedure` middleware added 2026-04-12 Phase C §8.3** — centralized auth guard using `authManager.isAuthenticated()` (honors dev bypass), throws `TRPCError UNAUTHORIZED` otherwise. Applied to enterpriseAuth.signOut/refreshToken + external.openExternal.
- `lib/trpc/routers/index.ts` — 22 routers in `createAppRouter` (21 feature routers + `createGitRouter()` for the git changes router).
- `lib/trpc/routers/enterprise-auth.ts` — Enterprise auth tRPC router (signIn public, signOut/refreshToken/getStatus). signOut+refreshToken now wrapped by authedProcedure.
- `lib/trpc/routers/external.ts` — Shell operations. `openExternal` now wrapped by authedProcedure. Also `getInstalledEditors` (added 2026-04-12 via PR #16, checks `/Applications/*.app` existence for dynamic Preferred Editor dropdown).
- `lib/trpc/routers/codex.ts` — `CodexMcpServerForSettings` type now has optional `serverInfo?`/`error?` fields aligning with Claude's `MCPServer` shape.
- `lib/feature-flags.ts` — Type-safe feature flags backed by DB table
- `electron.vite.config.ts` — Uses `build.externalizeDeps` (electron-vite 5.0 API). Current exclude list: `["superjson", "trpc-electron", "front-matter", "async-mutex"]`. **Renderer `manualChunks` added 2026-04-12 Phase C §8.5** — splits Monaco, mermaid, katex, cytoscape, shiki into separate lazy-loaded chunks.
- `src/main/windows/main.ts` — **`sandbox: true` empirically validated 2026-04-12** via `bun run dev` runtime test (§8.9). Preload surface is sandbox-compatible.
- `index.ts` line ~908 — `app.dock?.setMenu(dockMenu)` uses optional chaining (macOS-only API)

## Renderer (`src/renderer/`)
- `login.html` — Pre-auth sign-in screen (1Code logo, static HTML)
- `lib/mock-api.ts` — Phase 2 complete: 655 → 144 lines, F-entry stubs only
- `lib/message-parser.ts` — 5-stage tool normalization pipeline
- `lib/remote-trpc.ts` — Upstream tRPC client (F-entry boundary)
- `features/agents/stores/sub-chat-store.ts` — No persist middleware; rebuilt from DB
- `features/agents/main/active-chat.tsx` — **Phase C §8.7 complete 2026-04-12** — added `AgentChatExtras` local type near top of file (lines ~290) that captures upstream DTO fields (project, branch, isRemote, sandboxId/sandbox_id, subChats, remoteStats) not on the narrow prop contract. Replaces all 18 `(agentChat as any)?.X` sites with a single named structural narrow. `RollbackLookupMessage` now exported from message-store.ts for the rollback helper.
- `features/agents/stores/message-store.ts` — exports `RollbackLookupMessage` type for cross-file narrowing.
- `features/agents/ui/agent-diff-view.tsx` — `sandboxId: string | null | undefined` (was `string`), `repository?: string` (flat). Unified prop shape across `AgentDiffView` + `DiffSidebarContentProps` + `DiffSidebarRendererProps` on 2026-04-11. Imports `SupportedLanguages` from `@pierre/diffs`.

## Documentation Site (`docs/`)
- `docs.json` — xyd-js config (5 tabs, operations tab includes roadmap)
- `operations/roadmap.md` — **Single source of truth** for outstanding work
- `architecture/overview.md` — **Filled out 2026-04-12 Phase C §8.10** (was stub) — 3-process model, IPC + authedProcedure, state management, AI backend integration, database layer, fork posture.
- Build: `cd docs && bun run build` (cleans .xyd/ artifacts first)

## OpenSpec Specs (15 capabilities, 109 requirements as of 2026-04-13)
1code-api-litellm-provisioning (19), brand-identity (11), claude-code-auth-import (2), credential-storage (**8**), documentation-site (**9**), electron-runtime (4), **electron-security-hardening (4)** (new 2026-04-13), enterprise-auth (5), enterprise-auth-wiring (4), feature-flags (6), **frontmatter-parsing (6)**, renderer-data-access (5), self-hosted-api (**17**), shiki-highlighter (6), **sqlite-performance (3)** (new 2026-04-13).

## Active OpenSpec Changes (1 as of 2026-04-13 post-archive)
- `add-dual-mode-llm-routing` (28/55, Groups 1-7 landed commit `51318e1` — Entra decoupling + dual-mode routing; Groups 8-10 pending)
- `remediate-dev-server-findings` (scaffolded, unimplemented — next session `/opsx:apply`)
- `upgrade-vite-8-build-stack` (15/50, Phase A done, Phase B blocked on electron-vite 6.0.0 stable)

## Recently Archived (2026-04-10 → 2026-04-13)
- `2026-04-13-security-hardening-and-quality-remediation` (81/81 tasks; +18 requirements: `electron-security-hardening` & `sqlite-performance` specs created; `credential-storage`, `self-hosted-api`, `documentation-site` baselines expanded)
- `2026-04-12-replace-gray-matter-with-front-matter` (67/67)
- `2026-04-11-upgrade-electron-41` (26/27)
- `2026-04-11-add-1code-api-litellm-provisioning` (77/77)
- `2026-04-10-implement-1code-api`
- `2026-04-10-upgrade-shiki-4`
- `2026-04-10-upgrade-tailwind-4`
- `2026-04-10-upgrade-typescript-6`

## IDE Configuration
.vscode/settings.json — tracked in git (`.gitignore` uses `!.vscode/settings.json`).
Contains: tsgo native preview flag, SonarLint rule suppressions (50+ rules
disabled project-wide).

## Regression Tests (19 guards + 1 unit test = 20 files in tests/regression/)
auth-get-token-deleted, token-leak-logs-removed, credential-manager-deleted,
gpg-verification-present, feature-flags-shape, brand-sweep-complete,
no-upstream-sandbox-oauth, no-scratchpad-references, mock-api-no-snake-timestamps,
credential-storage-tier, enterprise-auth-module, enterprise-auth-wiring, electron-version-pin,
mock-api-consumer-migration, 1code-api single-replica enforcement, **no-gray-matter** (added 2026-04-12), **open-external-scheme** (added 2026-04-12 — enforces safeOpenExternal() usage), **signed-fetch-allowlist** (added 2026-04-12), **mcp-url-ssrf-prevention** (added 2026-04-12 Phase C §6 — 20 tests covering SSRF + Zod httpUrl scheme restrictions), and one unit test **frontmatter-shim-shape**.

Combined `bun test` total: **231 tests across 40 files** (221 pass + 10 skipped integration tests, 0 fail, ~6s) — `services/1code-api/tests/integration/` contains integration tests that skip without docker-compose.

## TypeScript type safety (2026-04-12)
**`as any` casts in src/: 96 → 3 (97% elimination)** via Phase C §8.7 systematic sweep. Only 2 remain in claude.ts at SDK streaming-message union boundaries (documented with justification comments); 1 grep false-positive in global.d.ts JSDoc prose. Reusable patterns from the sweep: (1) local structural narrow types per iteration block (AI SDK `UIMessage.parts`); (2) named "extras" types for upstream-DTO fields not on prop contracts (`AgentChatExtras`); (3) NodeJS.Global augmentation via `*.d.ts` (eliminates `global as any` cluster); (4) importable narrow types across modules (`RollbackLookupMessage` export).
