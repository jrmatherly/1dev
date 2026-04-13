# Codebase Structure

## Top-Level
```
src/           — Application source code
docs/          — Canonical xyd-js documentation site (Operations tab has roadmap)
deploy/        — K8s Flux v2 manifests: 1code-api, envoy-auth-policy (all ${PLACEHOLDER})
openspec/      — OpenSpec change proposals + 15 capability specs (109 requirements)
.claude/rules/ — 9 behavioral rules (2 global + 7 path-scoped)
.claude/skills/ — 17 workflow skills incl. `project-orchestrator` (routing + hard-rule gate)
.claude/agents/ — Subagents (db-schema-auditor, trpc-router-auditor, etc.)
tests/regression/ — **30 bun:test files** (29 regression guards + 1 frontmatter shim unit test; 170 tests / 393 expect() / ~6s)
tests/fixtures/   — Test fixtures
drizzle/       — Database migration files (0010_flowery_blackheart.sql is hand-edited exception per database.md)
services/1code-api/ — Backend API service (Fastify+tRPC+Drizzle/PostgreSQL). 20 test files.
.github/workflows/container-build.yml — Container build: multi-arch, GHCR push, Cosign signing
```

## Main Process (`src/main/`)
- `auth-manager.ts` — Strangler Fig adapter: branches on `enterpriseAuthEnabled` flag
- `lib/credential-store.ts` — Unified 3-tier credential encryption
- `lib/safe-external.ts` — Scheme-validated `safeOpenExternal()` wrapper
- `lib/safe-json-parse.ts` — Typed `safeJsonParse<T>()` utility
- `lib/frontmatter.ts` — Canonical frontmatter parser shim (wraps front-matter@4.0.2)
- **`lib/aux-ai.ts` (NEW 2026-04-13)** — Provider-aware sub-chat name + commit message generator. DI factory pattern (`makeGenerateChatTitle(deps)` / `makeGenerateCommitMessage(deps)` → bound exports). Dispatches across 4 ProviderMode kinds; Ollama fallback for `subscription-direct` + null mode. `setOllamaNameGenerator()` wires the Ollama helper forward-reference from chats.ts. Gated by `auxAiEnabled` flag. Replaces upstream apollosai.dev/api/agents/* call sites.
- `lib/claude/` — Phase C §7 decomposition 2026-04-12:
  - `prompt-parser.ts` (97 lines) — `parseMentions()`
  - `session-manager.ts` (59 lines) — active sessions + pending approvals
  - `mcp-resolver.ts` (528 lines) — MCP config aggregation + liveness probes
  - `tool-executor.ts` (240 lines) — `createCanUseTool(ctx)` factory
  - Pre-existing: `env.ts`, `index.ts`, `offline-handler.ts`, `raw-logger.ts`, `transform.ts`, `types.ts`
  - `trpc/routers/claude.ts` is now **2,503 lines** (down from 3,309, −24%).
  - **`getActiveProviderMode()` now EXPORTED 2026-04-13** (was unexported) — aux-ai.ts imports it.
- `lib/claude/raw-logger.ts` — **Hardened 2026-04-13** with singleton-promise pattern for concurrent-write race. `let logsDirPromise: Promise<string> | null` replaced `let logsDir: string | null`. Regression guard: `tests/regression/raw-logger-concurrent-writes.test.ts`.
- `lib/startup-preflight.ts` — **NEW 2026-04-13** — advisory-only `runStartupPreflight()` called right after `initDatabase()` in `src/main/index.ts`. Warns when `anthropic_accounts.routing_mode='litellm'` but `MAIN_VITE_LITELLM_BASE_URL` is unset.
- `lib/enterprise-auth.ts` — MSAL Node Entra token acquisition
- `lib/db/schema/index.ts` — Drizzle schema (7 tables: projects, chats, subChats, claudeCodeCredentials, anthropicAccounts, anthropicSettings, featureFlagOverrides). **`routingMode` default = `"direct"`** (was `"litellm"` pre-2026-04-13 hotfix).
- `lib/trpc/index.ts` — `authedProcedure` middleware
- `lib/trpc/routers/index.ts` — **22 routers in `createAppRouter`** (21 feature routers + `createGitRouter()`)
- `lib/trpc/routers/chats.ts` — **Refactored 2026-04-13** to delegate sub-chat name + commit message generation to `aux-ai.ts`. Upstream apollosai.dev/api/agents/* calls removed. `buildHeuristicCommitMessage(files)` extracted as a top-level helper and passed as the `fallback` arg to aux-ai.
- `lib/feature-flags.ts` — Type-safe feature flags backed by DB table. **9 flags** as of 2026-04-13: `enterpriseAuthEnabled`, `voiceViaLiteLLM`, `changelogSelfHosted`, `automationsSelfHosted`, `credentialStorageRequireEncryption`, `auxAiEnabled` (default true), `auxAiModel`, `auxAiTimeoutMs` (5000), `auxAiOrigin`.
- `electron.vite.config.ts` — Uses `build.externalizeDeps` (electron-vite 5.0 API).
- `src/main/windows/main.ts` — **signed-fetch + stream-fetch hardening 2026-04-13** — `checkUpstreamGate()` helper + `isUpstreamDisabled()` (rejects unset `MAIN_VITE_API_URL` or apollosai.dev hostname). `unreachableCache: Map<string, { checkedAt: number }>` with `UNREACHABLE_TTL_MS = 60_000`. `upstreamLogged` Set for once-per-origin warnings. `recordUnreachable()` called on ECONNREFUSED/ENOTFOUND in both handlers.
- `index.ts` line ~908 — `app.dock?.setMenu(dockMenu)` uses optional chaining (macOS-only API)

## Renderer (`src/renderer/`)
- `login.html` — Pre-auth sign-in screen
- `lib/mock-api.ts` — Phase 2 complete: 144 lines, F-entry stubs only
- `lib/remote-trpc.ts` — Upstream tRPC client (F-entry boundary)
- `features/agents/main/active-chat.tsx` — Phase C §8.7 complete 2026-04-12

## Documentation Site (`docs/`)
- `docs.json` — xyd-js config (5 tabs, operations tab includes roadmap)
- `operations/roadmap.md` — **Single source of truth** for outstanding work (37 P1/P2/P3 entries)
- `conventions/feature-flags.md` — **Updated 2026-04-13** with 9-flag table
- `enterprise/upstream-features.md` — **F11 + F12 added 2026-04-13** (sub-chat name + commit message, ✅ RESOLVED 3/4 modes)
- Build: `cd docs && bun run build` (cleans .xyd/ artifacts first)

## OpenSpec Specs (15 capabilities, 109 requirements as of 2026-04-13)
`1code-api-litellm-provisioning` (19), `brand-identity` (11), `claude-code-auth-import` (2), `credential-storage` (8), `documentation-site` (9), `electron-runtime` (4), `electron-security-hardening` (4), `enterprise-auth` (5), `enterprise-auth-wiring` (4), `feature-flags` (6), `frontmatter-parsing` (6), `renderer-data-access` (5), `self-hosted-api` (17), `shiki-highlighter` (6), `sqlite-performance` (3).

## Active OpenSpec Changes (5 as of 2026-04-13)
- `remediate-dev-server-findings` (58/71, Groups 1-19 landed; Group 18 manual smoke + Group 20 archive remain operator-driven)
- `add-dual-mode-llm-routing` (28/55, Groups 1-7 `51318e1`; Groups 8-10 pending)
- `improve-dev-launch-keychain-ux` (0/23, proposal scaffolded)
- `wire-login-button-to-msal` (45/57, awaiting smoke + archive)
- `upgrade-vite-8-build-stack` (15/50, Phase B blocked on electron-vite 6.0.0)

## Recently Archived (2026-04-10 → 2026-04-13)
- `2026-04-13-security-hardening-and-quality-remediation` (81/81; +18 requirements across 3 specs)
- `2026-04-12-replace-gray-matter-with-front-matter` (67/67)
- `2026-04-11-upgrade-electron-41` (26/27)
- `2026-04-11-add-1code-api-litellm-provisioning` (77/77)
- `2026-04-10-implement-1code-api`
- `2026-04-10-upgrade-shiki-4`
- `2026-04-10-upgrade-tailwind-4`
- `2026-04-10-upgrade-typescript-6`

## IDE Configuration
`.vscode/settings.json` — tracked in git (`.gitignore` uses `!.vscode/settings.json`). Contains tsgo native preview flag, SonarLint rule suppressions (50+ rules disabled project-wide).

## Regression Tests (29 guards + 1 unit test = 30 files in tests/regression/)
auth-get-token-deleted, token-leak-logs-removed, credential-manager-deleted, gpg-verification-present, feature-flags-shape, brand-sweep-complete, no-upstream-sandbox-oauth, no-scratchpad-references, mock-api-no-snake-timestamps, credential-storage-tier, enterprise-auth-module, enterprise-auth-wiring, electron-version-pin, mock-api-consumer-migration, 1code-api-single-replica, no-gray-matter, open-external-scheme, signed-fetch-allowlist, mcp-url-ssrf-prevention, spawn-env-invariants, no-entra-in-anthropic-auth-token, no-legacy-litellm-proxy-url, no-migrate-legacy, login-flow-uses-msal, raw-logger-concurrent-writes, no-legacy-oauth-byok-leak, **aux-ai-provider-dispatch** (2026-04-13), **no-apollosai-aux-ai-fetch** (2026-04-13), **signed-fetch-cache** (2026-04-13), + unit test frontmatter-shim-shape.

Combined `bun test` total: **170 regression tests / 393 expect() calls** + 232 service tests (242 total, 10 skipped integration) = ~412 tests across ~71 files.

## TypeScript type safety (2026-04-12)
**`as any` casts in src/: 96 → 3 (97% elimination)** via Phase C §8.7 systematic sweep. Reusable patterns: local structural narrow types per iteration block, named "extras" types for upstream-DTO fields, NodeJS.Global augmentation via `*.d.ts`, importable narrow types across modules.
