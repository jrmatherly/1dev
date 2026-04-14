# Codebase Structure

## Top-Level
```
src/           — Application source code
docs/          — Canonical xyd-js documentation site (Operations tab has roadmap)
deploy/        — K8s Flux v2 manifests: 1code-api, envoy-auth-policy
openspec/      — OpenSpec change proposals + 17 capability specs (136 requirements)
.claude/rules/ — 9 behavioral rules (2 global + 7 path-scoped)
.claude/skills/ — 20 workflow skills incl. `project-orchestrator`, `release-smoke`, `cluster-handoff`
.claude/agents/ — 9 subagents (db-schema-auditor, trpc-router-auditor, upstream-dependency-auditor, security-reviewer, ui-reviewer, test-coverage-auditor, openspec-task-progress-auditor, regression-guard-catalog-auditor, litellm-oss-boundary-auditor)
tests/regression/ — **35 bun:test files** (34 regression guards + 1 frontmatter shim unit test; 339 tests / 712 expect() / ~6s)
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
- **`lib/aux-ai.ts`** — Provider-aware sub-chat name + commit message generator. DI factory dispatches across 4 ProviderMode kinds + legacy Custom Model bridge. `sk-ant-*` heuristic for apiKey vs authToken. Per-route model defaults: `gpt-5-nano` (LiteLLM) / `claude-haiku-4-5` (Anthropic direct). Structured `[aux-ai]` breadcrumbs.
- `lib/claude/` — Phase C §7 decomposition:
  - `prompt-parser.ts` (97 lines) — `parseMentions()`
  - `session-manager.ts` (59 lines) — active sessions + pending approvals
  - `mcp-resolver.ts` (528 lines) — MCP config aggregation + liveness probes
  - `tool-executor.ts` (240 lines) — `createCanUseTool(ctx)` factory
  - Pre-existing: `env.ts`, `index.ts`, `offline-handler.ts`, `raw-logger.ts`, `transform.ts`, `types.ts`
  - `trpc/routers/claude.ts` — 2,503 lines. `getActiveProviderMode()` EXPORTED for aux-ai consumption.
- `lib/claude/raw-logger.ts` — Hardened with singleton-promise pattern for concurrent-write race.
- `lib/startup-preflight.ts` — Advisory-only preflight called after `initDatabase()`.
- `lib/enterprise-auth.ts` — MSAL Node Entra token acquisition
- `lib/db/schema/index.ts` — Drizzle schema (7 tables). `routingMode` default = `"direct"`.
- `lib/trpc/index.ts` — `authedProcedure` middleware
- `lib/trpc/routers/index.ts` — **23 routers in `createAppRouter`** (22 feature + createGitRouter()). New 2026-04-13: `litellmModels` for BYOK-LiteLLM wizard.
- `lib/trpc/routers/litellm-models.ts` — **Group 8 of archived add-dual-mode-llm-routing (archived 2026-04-14)** — proxies LiteLLM `/v1/models` with virtual-key Bearer auth. Structured error mapping: INTERNAL_SERVER_ERROR (env unset), UNAUTHORIZED (401/403), BAD_GATEWAY (network/non-ok), UNPROCESSABLE_CONTENT (malformed body). Projects to minimal `{id}` shape.
- `lib/trpc/routers/anthropic-accounts.ts` — **Group 9 of archived add-dual-mode-llm-routing (archived 2026-04-14)**: `getActive` returns `accountType` + `routingMode` (both live + legacy-fallback branches); `attachVirtualKey` mutation stitches LiteLLM virtual keys onto post-OAuth rows for the subscription+litellm wizard path.
- `lib/trpc/routers/enterprise-auth.ts` — **Group 9 addition**: `isEnabled` public query (non-throwing flag probe) — renderer gates consume this without catching PRECONDITION_FAILED on every load.
- `lib/trpc/routers/chats.ts` — Delegates sub-chat name + commit message generation to `aux-ai.ts`. tRPC inputs accept optional `customConfig: {model, token, baseUrl}` for legacy Custom Model onboarding.
- `lib/feature-flags.ts` — **9 flags**: `enterpriseAuthEnabled`, `voiceViaLiteLLM`, `changelogSelfHosted`, `automationsSelfHosted`, `credentialStorageRequireEncryption`, `auxAiEnabled`, `auxAiModel`, `auxAiTimeoutMs`, `auxAiOrigin`.
- `electron.vite.config.ts` — Uses `build.externalizeDeps` (electron-vite 5.0 API).
- `src/main/windows/main.ts` — signed-fetch + stream-fetch hardening. `checkUpstreamGate()` + `isUpstreamDisabled()`. `unreachableCache` 60s TTL. `upstreamLogged` once-per-origin. `recordUnreachable()` unwraps undici `err.cause.code`.

## Renderer (`src/renderer/`)
- `login.html` — Pre-auth sign-in screen
- `lib/mock-api.ts` — Phase 2 complete: 144 lines, F-entry stubs only
- `lib/remote-trpc.ts` — Upstream tRPC client (F-entry boundary)
- `lib/atoms/index.ts` — `customClaudeConfigAtom` (`{model, token, baseUrl}`) backs Custom Model onboarding. Consumed by `active-chat.tsx` + `use-commit-actions.ts` and forwarded to aux-AI tRPC procedures.
- `features/onboarding/api-key-onboarding-page.tsx` — "Configure Custom Model" form. Writes to `customClaudeConfigAtom` (localStorage), NOT `anthropicAccounts`.
- `components/dialogs/add-anthropic-account-wizard.tsx` — **Group 9 of archived add-dual-mode-llm-routing (archived 2026-04-14)** — 4-step wizard: account-type chooser → routing-mode (gated by `MAIN_VITE_ALLOW_DIRECT_ANTHROPIC`) → credentials (BYOK or subscription+virtualKey) → BYOK-LiteLLM model-slot mapper via `trpcUtils.litellmModels.listUserModels.fetch`. Subscription path delegates OAuth to existing Claude login modal via new `onTokenStored` atom hook; virtual key is attached post-OAuth via `attachVirtualKey` mutation.
- `components/dialogs/claude-login-modal.tsx` — **Group 9 extension**: reads `claudeLoginModalConfigAtom`; fires `onTokenStored()` after the invalidation fan-out so post-OAuth wizard actions see the freshly-created account via `getActive`.
- `features/agents/main/new-chat-form.tsx` — **Group 9 §9.9 gate**: `canAddModels = !(accountType === "claude-subscription" && enterpriseAuthEnabled)` withholds `onOpenModelsSettings` from `<AgentModelSelector>`, hiding the "Add Models" footer for managed-subscription enterprise sessions. Guarded by `tests/regression/subscription-lock-model-picker.test.ts`.
- `features/agents/main/active-chat.tsx` — Phase C §8.7 complete. Forwards legacy config to `generateSubChatNameMutation`.
- `features/changes/components/commit-input/use-commit-actions.ts` — Forwards legacy config to `generateCommitMutation`.

## Documentation Site (`docs/`)
- `docs.json` — xyd-js config (6 tabs: Architecture, Enterprise, Conventions, Operations, Code Graph, API Reference)
- `code-graph/` — Tree-sitter + Leiden community detection analysis (6 pages: overview, architecture-diagrams, critical-flows, community-coupling, key-subsystems, community-catalog)
- `operations/roadmap.md` — Single source of truth
- `conventions/feature-flags.md` — 9-flag table
- `enterprise/upstream-features.md` — F11/F12 RESOLVED 3/4 modes (aux-ai)
- **`enterprise/llm-routing-patterns.md` (NEW 2026-04-13)** — canonical four-pattern matrix (subscription-direct/subscription-litellm/byok-direct/byok-litellm); spawn-env recipes; MAIN_VITE_ALLOW_DIRECT_ANTHROPIC gate; x-litellm-customer-id attribution; Entra-vs-Anthropic-token anti-pattern section
- `conventions/regression-guards.md` — 30-guard catalog (+ unit test)
- `architecture/trpc-routers.md` — 23 routers (post-Group 8 of archived add-dual-mode-llm-routing, 2026-04-14)
- Build: `cd docs && bun run build` (~20s)

## OpenSpec Specs (17 capabilities, 136 requirements as of 2026-04-14)
`1code-api-litellm-provisioning` (19), `brand-identity` (11), `claude-code-auth-import` (3), `credential-storage` (8), `documentation-site` (9), `electron-runtime` (4), `electron-security-hardening` (4), `enterprise-auth` (5), `enterprise-auth-wiring` (4), `feature-flags` (7), `frontmatter-parsing` (6), `observability-logging` (1), `renderer-data-access` (9), `self-hosted-api` (17), `shiki-highlighter` (6), `sqlite-performance` (3).

## Active OpenSpec Changes (4 as of 2026-04-13)
- `add-dual-mode-llm-routing` ARCHIVED 2026-04-14 at 50/59 tasks (Groups 1-10 + 12 landed; 9 live-cluster smokes deferred to `docs/operations/roadmap.md` — new baseline `llm-routing` (7 reqs) promoted, modified `claude-code-auth-import`/`credential-storage`/`enterprise-auth`)
- `improve-dev-launch-keychain-ux` (0/23, proposal scaffolded)
- `wire-login-button-to-msal` (45/57, awaiting smoke + archive)
- `upgrade-vite-8-build-stack` (15/50, Phase B blocked)

## Recently Archived (2026-04-10 → 2026-04-13)
- `2026-04-13-remediate-dev-server-findings` (+7 requirements, `observability-logging` created)
- `2026-04-13-security-hardening-and-quality-remediation` (81/81; +18 requirements)
- `2026-04-12-replace-gray-matter-with-front-matter` (67/67)
- `2026-04-11-upgrade-electron-41` (26/27)
- `2026-04-11-add-1code-api-litellm-provisioning` (77/77)

## IDE Configuration
`.vscode/settings.json` — tracked in git. tsgo native preview flag + SonarLint rule suppressions.

## Regression Tests (34 guards + 1 unit test = 35 files in tests/regression/)
auth-get-token-deleted, token-leak-logs-removed, credential-manager-deleted, gpg-verification-present, feature-flags-shape, brand-sweep-complete, no-upstream-sandbox-oauth, no-scratchpad-references, mock-api-no-snake-timestamps, credential-storage-tier, enterprise-auth-module, enterprise-auth-wiring, electron-version-pin, mock-api-consumer-migration, 1code-api-single-replica, no-gray-matter, open-external-scheme, signed-fetch-allowlist, mcp-url-ssrf-prevention, spawn-env-invariants, no-entra-in-anthropic-auth-token, no-legacy-litellm-proxy-url, no-migrate-legacy, login-flow-uses-msal, raw-logger-concurrent-writes, no-legacy-oauth-byok-leak, aux-ai-provider-dispatch, no-apollosai-aux-ai-fetch, signed-fetch-cache, **litellm-models-router** (2026-04-13), + unit test frontmatter-shim-shape.

Combined `bun test` total: **339 tests / 712 expect() calls across 55 files** (incl. service tests; 10 skipped integration).

## TypeScript type safety (2026-04-12)
**`as any` casts in src/: 96 → 3 (97% elimination)** via Phase C §8.7.
