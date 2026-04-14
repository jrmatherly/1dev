# 1Code (ai-coding-cli) — Enterprise Fork

## Purpose
Local-first Electron desktop app for parallel AI-assisted development. Enterprise fork under apollosai.dev branding, being decoupled from upstream `1code.dev` backend.

## Tech Stack
- Electron ~41.2.0 (Node.js 24.14, Chromium 146, V8 14.6), electron-vite 5, electron-builder 26
- React 19.2.5, TypeScript 6.0.2, Tailwind CSS 4, Bun
- @anthropic-ai/claude-agent-sdk 0.2.104, **@anthropic-ai/sdk ^0.81.0** (explicit dep promoted 2026-04-13 for aux-AI module), Codex CLI 0.118.0, Ollama
- 7 Drizzle tables, 22 tRPC routers (incl. enterprise-auth), better-sqlite3, node-pty (lazy-loaded)
- **30 test files in `tests/regression/`** (29 regression guards + 1 frontmatter shim unit test — 174 tests / 414 expect() calls / ~6s). Recent additions via `remediate-dev-server-findings` (archived): `aux-ai-provider-dispatch`, `no-apollosai-aux-ai-fetch`, `signed-fetch-cache`, `raw-logger-concurrent-writes`, `no-legacy-oauth-byok-leak`. Plus 20 service test files in `services/1code-api/tests/`.

## Current State (2026-04-13, post-remediate-dev-server-findings archive)
- **Phase 0:** 15/15 hard gates complete
- **TS baseline: 0 errors** — CI fails on ANY new TS error.
- **`as any` casts in src/: 96 → 3 (97% elimination)** via Phase C §8.7.
- **claude.ts decomposition (§7):** 3,309 → 2,503 lines (−24%).
- **`src/main/lib/aux-ai.ts` (shipped 2026-04-13, archived change)** — Provider-aware sub-chat name + commit message generator. DI factory pattern dispatches across 4 ProviderMode kinds; **legacy Custom Model bridge** (via `LegacyCustomConfig` opts arg) handles users onboarded through the Custom Model form (localStorage Jotai atom, not anthropicAccounts). Includes structured `[aux-ai]` breadcrumbs for Group 18-style runtime diagnostics. Gated by `auxAiEnabled` feature flag. Per-route model defaults: `gpt-5-nano` for LiteLLM routes, `claude-haiku-4-5` for byok-direct (retired `claude-3-5-haiku-latest` removed).
- **signed-fetch hardening (archived 2026-04-13):** Removed silent `|| "https://apollosai.dev"` fallback. Added `checkUpstreamGate()` + `unreachableCache` Map (60s TTL). Undici-aware: `recordUnreachable` unwraps `err.cause?.code` + treats `TypeError("fetch failed")` as a cache-worthy signal. Logs once per origin per process via `upstreamLogged` Set.
- **Feature flags:** 9 total in `FLAG_DEFAULTS` — `enterpriseAuthEnabled`, `voiceViaLiteLLM`, `changelogSelfHosted`, `automationsSelfHosted`, `credentialStorageRequireEncryption`, `auxAiEnabled` (default true), `auxAiModel`, `auxAiTimeoutMs` (5000), `auxAiOrigin`.
- **`getActiveProviderMode()` exported** from `src/main/lib/trpc/routers/claude.ts` so aux-ai can consume it.
- **Tailwind 4.2.2, Vite 7.3.2 (Phase A), TypeScript 6.0.2, Electron 41.2.0** — all upgrades complete; Vite 8 Phase B blocked on electron-vite 6.0.0 stable.
- **sandbox: true** — empirically validated 2026-04-12.
- **1code-api service + LiteLLM provisioning** — fully shipped. Container: `ghcr.io/jrmatherly/1code-api`.
- **Enterprise auth:** Strangler Fig adapter pattern (`enterpriseAuthEnabled` flag). Login button wired end-to-end via MSAL 2026-04-13.
- **Project-orchestrator skill** — routing-layer skill with Step-0 hard-rule gate.
- **Dev auth bypass:** `MAIN_VITE_DEV_BYPASS_AUTH=true` in `.env`
- **Centralized roadmap:** `docs/operations/roadmap.md` — single source of truth.
- **Release pipeline:** GitHub Actions `release.yml` 3-OS matrix. Current: **v0.0.85** (2026-04-13).
- **Active OpenSpec changes (4 as of 2026-04-13 post-archive):**
  - `add-dual-mode-llm-routing` (28/55, Groups 1-7 landed `51318e1`; Groups 8-10 pending)
  - `improve-dev-launch-keychain-ux` (0/23, proposal scaffolded)
  - `wire-login-button-to-msal` (45/57, awaiting smoke + archive)
  - `upgrade-vite-8-build-stack` (15/50, Phase B blocked on electron-vite 6.0.0)
- **F-entry catalog:** F1-F12 (F11/F12 RESOLVED 3/4 modes via aux-ai; `subscription-direct` is qualified-resolved with Ollama-or-truncated + heuristic fallbacks). See `docs/enterprise/upstream-features.md`.
- **Recently archived:**
  - 2026-04-13 `remediate-dev-server-findings` (63/71 tasks, +7 requirements promoted, new `observability-logging` capability created, 4 existing specs expanded)
  - 2026-04-13 `security-hardening-and-quality-remediation` (81/81, +18 requirements)
- **Upgrade execution order:** ~~E41~~ ✅ → ~~TS6~~ ✅ → ~~Vite7-A~~ ✅ → ~~TW4~~ ✅ → ~~Shiki4~~ ✅ → Vite8-B (blocked)

## Architecture (3-tier)
- CLAUDE.md is a ~135-line thin index
- `docs/` is the canonical source of truth
- `.claude/rules/` has 9 behavioral rules (2 global + 7 path-scoped)
- `openspec/specs/` has **16 capability specs (116 requirements)** as of 2026-04-13
- Skills/agents read from canonical docs, not CLAUDE.md

## Aux-AI dispatch pattern (reusable learnings from 2026-04-13)
1. **DI factory for per-provider-mode testing** — `makeGenerateChatTitle(deps)` → bound `generateChatTitle`. AuxAiDeps accepts `createAnthropic`, `generateOllamaName`, `getProviderMode`, `getFlag`.
2. **setOllamaNameGenerator forward-wiring avoids circular imports** — aux-ai.ts can't import chats.ts; chats.ts calls `setOllamaNameGenerator(generateChatNameWithOllama)` at module load.
3. **Heuristic fallback extracted as the safety net** — `buildHeuristicCommitMessage(files)` passed to `aux-ai.generateCommitMessage` as the `fallback` arg.
4. **Legacy Custom Model bridge** — `LegacyCustomConfig` + `GenerateChatTitleOpts.customConfig` field. When ProviderMode is null but renderer supplies `{model, token, baseUrl}` from `customClaudeConfigAtom`, `legacyCustomConfigSdkOpts()` synthesizes SDK call. `sk-ant-*` token heuristic → apiKey; else → authToken. User's explicit model wins over per-route default.
5. **Structured breadcrumb observability** — `[aux-ai] generateChatTitle: mode=… flagModel=… hasLegacyConfig=…` + `[aux-ai] SDK call: model=… baseURL=…` + per-branch success/failure. Tractable runtime diagnostics without requiring Electron-in-test harness.
6. **Shape-based regression guards over runtime tests** — bun:test can't load Electron; guards scan source for required patterns.
7. **SonarJS "no-extra-arguments" false positive** — default initializers for function-typed let variables must declare params explicitly.
8. **Undici cause.code unwrap for negative cache** — Node 18+ native fetch wraps errors as `TypeError("fetch failed")` with the real code on `err.cause.code`. `recordUnreachable` must unwrap both `err.code` and `err.cause?.code` + treat `fetch failed` itself as cache-worthy.

## §7 claude.ts decomposition patterns (reusable learnings)
1. **Sequential per-extraction commits** — keeps review surgical.
2. **Re-export shim for stability** — external importers never need to update imports.
3. **Facade over module-state clears** — each module owns its caches.
4. **Factory-function lift for observer-state closures** — `createCanUseTool(ctx)`.
5. **Orphan-import pruning** — SonarLint S1128 + grep usage count.
6. **Honest partial completion over forced fit** — partial + roadmap entry preferred.
