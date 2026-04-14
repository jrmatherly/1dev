# Codebase Structure

## Top-Level
```
src/           — Application source code
docs/          — Canonical xyd-js documentation site (Operations tab has roadmap)
deploy/        — K8s Flux v2 manifests: 1code-api, envoy-auth-policy
openspec/      — OpenSpec change proposals + 16 capability specs (116 requirements)
.claude/rules/ — 9 behavioral rules (2 global + 7 path-scoped)
.claude/skills/ — 17 workflow skills incl. `project-orchestrator`
.claude/agents/ — Subagents (db-schema-auditor, trpc-router-auditor, etc.)
tests/regression/ — **30 bun:test files** (29 regression guards + 1 frontmatter shim unit test; 174 tests / 414 expect() / ~6s)
tests/fixtures/   — Test fixtures
drizzle/       — Database migration files (0010_flowery_blackheart.sql is hand-edited exception)
services/1code-api/ — Backend API service (Fastify+tRPC+Drizzle/PostgreSQL). 20 test files.
.github/workflows/container-build.yml — Multi-arch, GHCR push, Cosign signing
```

## Main Process (`src/main/`)
- `auth-manager.ts` — Strangler Fig adapter branches on `enterpriseAuthEnabled` flag
- `lib/credential-store.ts` — Unified 3-tier credential encryption
- `lib/safe-external.ts` — Scheme-validated `safeOpenExternal()` wrapper
- `lib/safe-json-parse.ts` — Typed `safeJsonParse<T>()` utility
- `lib/frontmatter.ts` — Canonical frontmatter parser shim (wraps front-matter@4.0.2)
- **`lib/aux-ai.ts`** — Provider-aware sub-chat name + commit message generator. DI factory (`makeGenerateChatTitle(deps)` / `makeGenerateCommitMessage(deps)` → bound exports). Dispatches across 4 ProviderMode kinds + **legacy Custom Model bridge** when ProviderMode is null (`GenerateChatTitleOpts.customConfig` arg). `sk-ant-*` token heuristic for apiKey vs authToken. Per-route model defaults: `gpt-5-nano` (LiteLLM) / `claude-haiku-4-5` (Anthropic direct). Structured `[aux-ai]` breadcrumbs at entry + SDK call + success/failure. Gated by `auxAiEnabled` flag.
- `lib/claude/` — Phase C §7 decomposition:
  - `prompt-parser.ts` (97 lines) — `parseMentions()`
  - `session-manager.ts` (59 lines) — active sessions + pending approvals
  - `mcp-resolver.ts` (528 lines) — MCP config aggregation + liveness probes
  - `tool-executor.ts` (240 lines) — `createCanUseTool(ctx)` factory
  - Pre-existing: `env.ts`, `index.ts`, `offline-handler.ts`, `raw-logger.ts`, `transform.ts`, `types.ts`
  - `trpc/routers/claude.ts` — **2,503 lines** (down from 3,309, −24%). `getActiveProviderMode()` EXPORTED for aux-ai consumption.
- `lib/claude/raw-logger.ts` — Hardened with singleton-promise pattern for concurrent-write race. Regression guard: `tests/regression/raw-logger-concurrent-writes.test.ts`.
- `lib/startup-preflight.ts` — Advisory-only `runStartupPreflight()` called after `initDatabase()`. Warns on `routing_mode='litellm'` + unset `MAIN_VITE_LITELLM_BASE_URL`.
- `lib/enterprise-auth.ts` — MSAL Node Entra token acquisition
- `lib/db/schema/index.ts` — Drizzle schema (7 tables). **`routingMode` default = `"direct"`**.
- `lib/trpc/index.ts` — `authedProcedure` middleware
- `lib/trpc/routers/index.ts` — **22 routers in `createAppRouter`** (21 feature + createGitRouter())
- `lib/trpc/routers/chats.ts` — Delegates sub-chat name + commit message generation to `aux-ai.ts`. **tRPC inputs accept optional `customConfig: {model, token, baseUrl}`** for legacy Custom Model onboarding path. `buildHeuristicCommitMessage(files)` extracted as top-level helper.
- `lib/feature-flags.ts` — **9 flags** type-safe: `enterpriseAuthEnabled`, `voiceViaLiteLLM`, `changelogSelfHosted`, `automationsSelfHosted`, `credentialStorageRequireEncryption`, `auxAiEnabled`, `auxAiModel`, `auxAiTimeoutMs`, `auxAiOrigin`.
- `electron.vite.config.ts` — Uses `build.externalizeDeps` (electron-vite 5.0 API).
- `src/main/windows/main.ts` — signed-fetch + stream-fetch hardening. `checkUpstreamGate()` + `isUpstreamDisabled()` reject unset `MAIN_VITE_API_URL` or apollosai.dev hostname. `unreachableCache: Map<string, {checkedAt: number}>` with `UNREACHABLE_TTL_MS = 60_000`. `upstreamLogged` Set for once-per-origin warnings. **`recordUnreachable()` unwraps undici `err.cause.code` + treats `TypeError("fetch failed")` as cache-worthy** (else cache never populates under dev-server smoke).

## Renderer (`src/renderer/`)
- `login.html` — Pre-auth sign-in screen
- `lib/mock-api.ts` — Phase 2 complete: 144 lines, F-entry stubs only
- `lib/remote-trpc.ts` — Upstream tRPC client (F-entry boundary)
- `lib/atoms/index.ts` — **`customClaudeConfigAtom`** (`{model, token, baseUrl}`) backs the Custom Model onboarding form. Consumed by `active-chat.tsx` + `use-commit-actions.ts` and forwarded to aux-AI tRPC procedures so the legacy-bridge path reaches the main process.
- `features/onboarding/api-key-onboarding-page.tsx` — "Configure Custom Model" form (Model name / API token / Base URL). Writes to `customClaudeConfigAtom` (localStorage), NOT to `anthropicAccounts`.
- `features/agents/main/active-chat.tsx` — Phase C §8.7 complete. Calls `generateSubChatNameMutation.mutateAsync({...customConfig})` to forward legacy config.
- `features/changes/components/commit-input/use-commit-actions.ts` — Calls `generateCommitMutation.mutateAsync({...customConfig})` for Custom Model users.

## Documentation Site (`docs/`)
- `docs.json` — xyd-js config (5 tabs, operations tab includes roadmap)
- `operations/roadmap.md` — Single source of truth for outstanding work
- `conventions/feature-flags.md` — 9-flag table
- `enterprise/upstream-features.md` — F11/F12 RESOLVED 3/4 modes (aux-ai)
- `conventions/regression-guards.md` — 29-guard catalog (+ unit test)
- Build: `cd docs && bun run build` (~20s)

## OpenSpec Specs (16 capabilities, 116 requirements as of 2026-04-13)
`1code-api-litellm-provisioning` (19), `brand-identity` (11), `claude-code-auth-import` (3), `credential-storage` (8), `documentation-site` (9), `electron-runtime` (4), `electron-security-hardening` (4), `enterprise-auth` (5), `enterprise-auth-wiring` (4), `feature-flags` (7), `frontmatter-parsing` (6), **`observability-logging` (1)** NEW 2026-04-13 from remediate-dev-server-findings, `renderer-data-access` (9), `self-hosted-api` (17), `shiki-highlighter` (6), `sqlite-performance` (3).

## Active OpenSpec Changes (4 as of 2026-04-13 post-archive)
- `add-dual-mode-llm-routing` (28/55, Groups 1-7 `51318e1`)
- `improve-dev-launch-keychain-ux` (0/23, proposal scaffolded)
- `wire-login-button-to-msal` (45/57, awaiting smoke + archive)
- `upgrade-vite-8-build-stack` (15/50, Phase B blocked)

## Recently Archived (2026-04-10 → 2026-04-13)
- `2026-04-13-remediate-dev-server-findings` (63/71 tasks; +7 requirements: `observability-logging` created, `renderer-data-access` 5→9, `feature-flags` 6→7, `claude-code-auth-import` 2→3, `enterprise-auth` modified)
- `2026-04-13-security-hardening-and-quality-remediation` (81/81; +18 requirements across 3 specs)
- `2026-04-12-replace-gray-matter-with-front-matter` (67/67)
- `2026-04-11-upgrade-electron-41` (26/27)
- `2026-04-11-add-1code-api-litellm-provisioning` (77/77)

## IDE Configuration
`.vscode/settings.json` — tracked in git. tsgo native preview flag + SonarLint rule suppressions (50+ rules disabled project-wide).

## Regression Tests (29 guards + 1 unit test = 30 files in tests/regression/)
auth-get-token-deleted, token-leak-logs-removed, credential-manager-deleted, gpg-verification-present, feature-flags-shape, brand-sweep-complete, no-upstream-sandbox-oauth, no-scratchpad-references, mock-api-no-snake-timestamps, credential-storage-tier, enterprise-auth-module, enterprise-auth-wiring, electron-version-pin, mock-api-consumer-migration, 1code-api-single-replica, no-gray-matter, open-external-scheme, signed-fetch-allowlist, mcp-url-ssrf-prevention, spawn-env-invariants, no-entra-in-anthropic-auth-token, no-legacy-litellm-proxy-url, no-migrate-legacy, login-flow-uses-msal, raw-logger-concurrent-writes, no-legacy-oauth-byok-leak, aux-ai-provider-dispatch, no-apollosai-aux-ai-fetch, signed-fetch-cache, + unit test frontmatter-shim-shape.

Combined `bun test` total: **174 regression tests / 414 expect() calls** + 232 service tests (10 skipped integration) = ~412 tests across ~71 files.

## TypeScript type safety (2026-04-12)
**`as any` casts in src/: 96 → 3 (97% elimination)** via Phase C §8.7.
