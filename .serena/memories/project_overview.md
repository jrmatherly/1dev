# 1Code (ai-coding-cli) — Enterprise Fork

## Purpose
Local-first Electron desktop app for parallel AI-assisted development. Enterprise fork under apollosai.dev branding, being decoupled from upstream `1code.dev` backend.

## Tech Stack
- Electron ~41.2.0 (Node.js 24.14, Chromium 146, V8 14.6), electron-vite 5, electron-builder 26
- React 19.2.5, TypeScript 6.0.2, Tailwind CSS 4, Bun
- @anthropic-ai/claude-agent-sdk 0.2.104, **@anthropic-ai/sdk ^0.81.0** (explicit dep, for aux-AI module), Codex CLI 0.118.0, Ollama
- 7 Drizzle tables, **23 tRPC routers** (incl. enterprise-auth, litellmModels), better-sqlite3, node-pty (lazy-loaded)
- **32 test files in `tests/regression/`** (31 regression guards + 1 frontmatter shim unit test — 191 tests / 441 expect() / ~6s). Recent additions via `remediate-dev-server-findings` (archived 2026-04-13): `aux-ai-provider-dispatch`, `no-apollosai-aux-ai-fetch`, `signed-fetch-cache`, `raw-logger-concurrent-writes`, `no-legacy-oauth-byok-leak`. Plus `litellm-models-router` (2026-04-13, from archived `add-dual-mode-llm-routing` Group 8, archived 2026-04-14) and `subscription-lock-model-picker` (2026-04-13, Group 9.10). Plus 20 service test files in `services/1code-api/tests/`.

## Current State (2026-04-14, after archiving add-dual-mode-llm-routing at 50/59 — 9 live-cluster smokes deferred to roadmap)
- **Phase 0:** 15/15 hard gates complete
- **TS baseline: 0 errors** — CI fails on ANY new TS error.
- **`as any` casts in src/: 96 → 3 (97% elimination)** via Phase C §8.7.
- **claude.ts decomposition (§7):** 3,309 → 2,503 lines (−24%).
- **`src/main/lib/aux-ai.ts`** — Provider-aware sub-chat name + commit message generator. DI factory pattern + legacy Custom Model bridge. Per-route model defaults: `gpt-5-nano` (LiteLLM) / `claude-haiku-4-5` (Anthropic direct). Gated by `auxAiEnabled` flag.
- **`src/main/lib/trpc/routers/litellm-models.ts` (2026-04-13, Group 8 of archived add-dual-mode-llm-routing, archived 2026-04-14)** — proxies LiteLLM `/v1/models` with virtual-key Bearer auth. Structured error mapping (INTERNAL_SERVER_ERROR / UNAUTHORIZED / BAD_GATEWAY / UNPROCESSABLE_CONTENT). Consumed by the Group 9 onboarding wizard's "Fetch Models" button.
- **`docs/enterprise/llm-routing-patterns.md` (2026-04-13, Group 10 of archived add-dual-mode-llm-routing, archived 2026-04-14)** — canonical four-pattern matrix (`subscription-direct`, `subscription-litellm`, `byok-direct`, `byok-litellm`) with exact spawn-env recipes, `MAIN_VITE_ALLOW_DIRECT_ANTHROPIC` gate semantics, `x-litellm-customer-id` attribution, Entra-vs-Anthropic-token anti-pattern section.
- **signed-fetch hardening:** `checkUpstreamGate()` + undici-aware `recordUnreachable` + 60s negative cache.
- **Feature flags:** 9 total — `enterpriseAuthEnabled` (build-time env override, no longer gated by `!app.isPackaged`), `voiceViaLiteLLM`, `changelogSelfHosted`, `automationsSelfHosted`, `credentialStorageRequireEncryption`, `auxAiEnabled`, `auxAiModel`, `auxAiTimeoutMs`, `auxAiOrigin`.
- **`getActiveProviderMode()` exported** from `src/main/lib/trpc/routers/claude.ts`.
- **Tailwind 4.2.2, Vite 7.3.2 (Phase A), TypeScript 6.0.2, Electron 41.2.0** — upgrades complete; Vite 8 Phase B blocked.
- **sandbox: true** — empirically validated.
- **1code-api service + LiteLLM provisioning** — fully shipped. Container: `ghcr.io/jrmatherly/1code-api`.
- **Enterprise auth:** Strangler Fig adapter pattern. Login button wired via MSAL end-to-end.
- **Project-orchestrator skill** — routing-layer skill with Step-0 hard-rule gate.
- **Dev auth bypass:** `MAIN_VITE_DEV_BYPASS_AUTH=true` in `.env`
- **Centralized roadmap:** `docs/operations/roadmap.md` — single source of truth.
- **Release pipeline:** GitHub Actions `release.yml` 3-OS matrix with shared concurrency group (`cancel-in-progress: true`). Current: **v0.0.90** (2026-04-14). Entra auth credentials injected from GitHub secrets at build time.
- **Active OpenSpec changes (6 as of 2026-04-13 late):**
  - `add-dual-mode-llm-routing` ARCHIVED 2026-04-14 at 50/59 (Groups 1-10 + 12 landed: Entra decoupling + dual-mode routing at `51318e1` + `8befc62` + `0f43165`; litellmModels router at `6354ea6`; llm-routing-patterns doc at `5948383`; Settings UI wizard + subscription-lock model-picker gate at `336a0ac`; Group 12 CI-gate validation at `9938a9a`. New baseline `llm-routing` (7 reqs) + modified `claude-code-auth-import`/`credential-storage`/`enterprise-auth`. 9 deferred live-cluster smokes tracked in `docs/operations/roadmap.md`.)
  - `fix-preferred-editor-detection` (0/31, scaffolded 2026-04-13 commit `3def1a8` — npm `which`-based PATH detection porting the ShipIT pattern + OS-default derivation + `preferredEditorAtom` default null-ification)
  - `add-entra-graph-profile` (0/45, scaffolded 2026-04-13 commit `3def1a8` — Graph `User.Read` delegated scope + `/me` profile fields + `/me/photo/$value` avatar with initials fallback)
  - `improve-dev-launch-keychain-ux` (0/23, proposal scaffolded)
  - `wire-login-button-to-msal` (45/57, awaiting smoke + archive)
  - `upgrade-vite-8-build-stack` (15/50, Phase B blocked on electron-vite 6.0.0)
- **F-entry catalog:** F1-F12 (F11/F12 RESOLVED 3/4 modes via aux-ai).
- **Recently archived:**
  - 2026-04-13 `remediate-dev-server-findings` (63/71 tasks, +7 requirements, new `observability-logging` baseline)
  - 2026-04-13 `security-hardening-and-quality-remediation` (81/81, +18 requirements)
- **Upgrade execution order:** ~~E41~~ ✅ → ~~TS6~~ ✅ → ~~Vite7-A~~ ✅ → ~~TW4~~ ✅ → ~~Shiki4~~ ✅ → Vite8-B (blocked)

## Architecture (3-tier)
- CLAUDE.md is a ~135-line thin index
- `docs/` is the canonical source of truth (6 tabs: Architecture, Enterprise, Conventions, Operations, Code Graph, API Reference)
- `docs/code-graph/` — Tree-sitter + Leiden community detection analysis (3,797 nodes / 29,438 edges / 406 communities / 50+ execution flows). 6 pages: overview, architecture-diagrams, critical-flows, community-coupling, key-subsystems, community-catalog.
- `.claude/rules/` has 9 behavioral rules (2 global + 7 path-scoped)
- `openspec/specs/` has **17 capability specs (124 requirements)** as of 2026-04-14
- Skills/agents read from canonical docs

## Aux-AI dispatch pattern (reusable learnings)
1. **DI factory for per-provider-mode testing** — AuxAiDeps accepts `createAnthropic`, `generateOllamaName`, `getProviderMode`, `getFlag`.
2. **setOllamaNameGenerator forward-wiring avoids circular imports**.
3. **Heuristic fallback extracted as the safety net** — `buildHeuristicCommitMessage(files)`.
4. **Legacy Custom Model bridge** — `LegacyCustomConfig` + `GenerateChatTitleOpts.customConfig`. `sk-ant-*` token → apiKey; else → authToken. User's explicit model wins.
5. **Structured breadcrumb observability** — `[aux-ai] generateChatTitle: mode=… flagModel=… hasLegacyConfig=…`.
6. **Shape-based regression guards over runtime tests** — bun:test can't load Electron.
7. **SonarJS "no-extra-arguments" false positive** — default initializers for function-typed let variables must declare params explicitly.
8. **Undici cause.code unwrap for negative cache** — Node 18+ fetch wraps errors as `TypeError("fetch failed")` with real code on `err.cause.code`.

## litellmModels router pattern (reusable learnings from Group 8 2026-04-13)
1. **Minimal projection from OpenAI-compatible envelope** — `/v1/models` returns `{object, data: [{id, object, owned_by, created}]}`. Project to `{id}` only so wizard consumers don't couple to full upstream contract. Future LiteLLM field additions don't break the UI.
2. **Structured TRPCError codes map cleanly to UI** — INTERNAL_SERVER_ERROR (env unset, operator misconfig), UNAUTHORIZED (401/403, actionable "invalid key" message), BAD_GATEWAY (network failure or non-ok, retryable), UNPROCESSABLE_CONTENT (malformed body). Collapsing all to 500 would lose the per-error UI treatment.
3. **Trailing-slash normalization** — `baseUrl.replace(/\/+$/, "") + "/v1/models"` handles both `https://llms.host` and `https://llms.host/` transparently.
4. **trpc-router-auditor catches cross-surface drift** — the subagent initially reported 3 drift points when Group 8 landed (trpc-routers.md total-count footer + tech-stack.md:19 + overview.md:24). Pattern: when bumping router count, also grep for "N routers" across `docs/architecture/`.
