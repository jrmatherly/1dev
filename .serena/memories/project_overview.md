# 1Code (ai-coding-cli) — Enterprise Fork

## Purpose
Local-first Electron desktop app for parallel AI-assisted development. Enterprise fork under apollosai.dev branding, being decoupled from upstream `1code.dev` backend.

## Tech Stack
- Electron ~41.2.0 (Node.js 24.14, Chromium 146, V8 14.6), electron-vite 5, electron-builder 26
- React 19.2.5, TypeScript 6.0.2 (upgraded from 5.9.3 on 2026-04-10), Tailwind CSS 4, Bun
- @anthropic-ai/claude-agent-sdk 0.2.104, **@anthropic-ai/sdk ^0.81.0 promoted to explicit dep 2026-04-13** (for aux-AI module), Codex CLI 0.118.0, Ollama
- 7 Drizzle tables, 22 tRPC routers (incl. enterprise-auth), better-sqlite3, node-pty (lazy-loaded)
- **30 test files in `tests/regression/`** (29 regression guards + 1 frontmatter shim unit test — 170 tests / 393 expect() calls). Recent additions via `remediate-dev-server-findings`: `aux-ai-provider-dispatch`, `no-apollosai-aux-ai-fetch`, `signed-fetch-cache`, `raw-logger-concurrent-writes`, `no-legacy-oauth-byok-leak`. Plus 20 service test files in `services/1code-api/tests/`.

## Current State (2026-04-13, post-remediate-dev-server-findings Groups 1-19)
- **Phase 0:** 15/15 hard gates complete
- **TS baseline: 0 errors** (reduced from 32 → 0 on 2026-04-11). Baseline file = 0; CI fails on ANY new TS error.
- **`as any` casts in src/: 96 → 3 (97% elimination)** via Phase C §8.7 sweep 2026-04-12.
- **claude.ts decomposition (§7):** 3,309 → 2,503 lines (−24%) via 4 new modules in `src/main/lib/claude/`.
- **New 2026-04-13: `src/main/lib/aux-ai.ts` (provider-aware sub-chat name + commit message)** — DI factory pattern, dispatches across 4 ProviderMode kinds (byok-direct, byok-litellm, subscription-litellm = SDK routes; subscription-direct = Ollama-or-truncated). Replaces upstream apollosai.dev/api/agents/* call sites. Gated by `auxAiEnabled` feature flag.
- **Tailwind 4.2.2:** Upgraded from 3.4.19 on 2026-04-10.
- **Vite 7.3.2 (Phase A):** Upgraded from 6.4.2 on 2026-04-10. Phase B blocked on `electron-vite 6.0.0` stable.
- **TypeScript 6.0.2:** Upgraded from 5.9.3 on 2026-04-10.
- **Electron 41.2.0:** Upgraded from 40.8.5. Auto-updater end-to-end pending packaged-build verification.
- **sandbox: true** — Empirically validated 2026-04-12 via `bun run dev` runtime test.
- **1code-api service + LiteLLM provisioning:** Fully shipped. `services/1code-api/` with Fastify+tRPC+Drizzle/PostgreSQL. Container: `ghcr.io/jrmatherly/1code-api`.
- **Enterprise auth:** Wired into auth-manager via Strangler Fig adapter pattern (`enterpriseAuthEnabled` flag). Login button wired end-to-end via MSAL 2026-04-13 (`wire-login-button-to-msal` change).
- **signed-fetch hardening (2026-04-13):** Removed silent `|| "https://apollosai.dev"` fallback in `src/main/windows/main.ts`. Added `checkUpstreamGate()` + `unreachableCache` Map (60s TTL). Logs once per origin per process via `upstreamLogged` Set.
- **Feature flags (2026-04-13):** 9 total in `FLAG_DEFAULTS` — `enterpriseAuthEnabled`, `voiceViaLiteLLM`, `changelogSelfHosted`, `automationsSelfHosted`, `credentialStorageRequireEncryption`, `auxAiEnabled` (default true), `auxAiModel`, `auxAiTimeoutMs` (5000), `auxAiOrigin`.
- **Project-orchestrator skill:** routing-layer skill with Step-0 hard-rule gate.
- **Dev auth bypass:** `MAIN_VITE_DEV_BYPASS_AUTH=true` in `.env`
- **Centralized roadmap:** `docs/operations/roadmap.md` — single source of truth (37 active entries).
- **Release pipeline:** GitHub Actions `release.yml` 3-OS matrix. Current: **v0.0.85** (published 2026-04-13 — first release with full container-build pipeline green including Trivy + Cosign).
- **Active OpenSpec changes (5 as of 2026-04-13):**
  - `remediate-dev-server-findings` (58/71, Groups 1-19 landed across commits `0f43165` + `3b37397` + `96af6c5` + `01d451e` — auth hardening, aux-AI module, signed-fetch gate, 3 guards, F11/F12 catalog. Group 18 manual smoke + Group 20 archive operator-driven.)
  - `add-dual-mode-llm-routing` (28/55, Groups 1-7 landed `51318e1`; Groups 8-10 pending UI wizard + litellmModels router + docs)
  - `improve-dev-launch-keychain-ux` (0/23, proposal scaffolded commit `83d0d84` — ShipIT detection pattern)
  - `wire-login-button-to-msal` (45/57, MSAL sign-in end-to-end; awaiting manual smoke §11 + `/opsx:archive`)
  - `upgrade-vite-8-build-stack` (15/50, Phase B blocked on electron-vite 6.0.0)
- **F-entry catalog expansion (2026-04-13):** F11 (sub-chat name) + F12 (commit message) added as ✅ RESOLVED (3/4 modes). `subscription-direct` is qualified-resolved with Ollama-or-truncated + heuristic fallbacks respectively. See `docs/enterprise/upstream-features.md`.
- **Recently archived:**
  - 2026-04-13 `security-hardening-and-quality-remediation` (81/81 tasks, +18 requirements; created `electron-security-hardening` + `sqlite-performance` baselines; expanded `credential-storage` 7→8, `self-hosted-api` 11→17, `documentation-site` 5→9)
- **Upgrade execution order:** ~~E41~~ ✅ → ~~TS6~~ ✅ → ~~Vite7-A~~ ✅ → ~~TW4~~ ✅ → ~~Shiki4~~ ✅ → Vite8-B (blocked)

## Architecture (3-tier)
- CLAUDE.md is a ~135-line thin index (links, doesn't contain content)
- `docs/` is the canonical source of truth (Operations tab has roadmap)
- `.claude/rules/` has 9 behavioral rules (2 global + 7 path-scoped)
- `openspec/specs/` has **15 capability specs (109 requirements)** as of 2026-04-13
- Skills/agents read from canonical docs, not CLAUDE.md

## Aux-AI dispatch pattern (reusable learnings from 2026-04-13)
1. **DI factory for per-provider-mode testing** — `makeGenerateChatTitle(deps)` → bound `generateChatTitle`. AuxAiDeps accepts `createAnthropic`, `generateOllamaName`, `getProviderMode`, `getFlag`. Tests construct synthetic deps for each `ProviderMode` kind without mocking the real SDK.
2. **setOllamaNameGenerator forward-wiring avoids circular imports** — `aux-ai.ts` can't import from `chats.ts` (which imports from aux-ai). Production deps initialize with a no-op default; `chats.ts` calls `setOllamaNameGenerator(generateChatNameWithOllama)` at module load to wire in the real generator.
3. **Heuristic fallback extracted as the safety net** — `buildHeuristicCommitMessage(files)` is the deterministic conventional-commits generator, passed to `aux-ai.generateCommitMessage` as the `fallback` arg. When no SDK route is viable, the helper returns the heuristic verbatim.
4. **Shape-based regression guards over runtime tests** — bun:test can't load Electron; guards scan source for required patterns (DI exports, per-mode branches, customerId header, model precedence, hardcoded max_tokens/temperature). Runtime behavior deferred to manual smoke (Group 18).
5. **SonarJS "no-extra-arguments" false positive** — default initializers for function-typed let variables must declare params explicitly (`async (_userMessage, _model) => null`) or SonarJS infers zero-arg contract from the arrow and flags the call site as error.

## §7 claude.ts decomposition patterns (reusable learnings)
1. **Sequential per-extraction commits** — keeps review surgical and rollback cheap.
2. **Re-export shim for stability** — external importers never need to update imports.
3. **Facade over module-state clears** — external callers keep single entry point; each module owns its caches.
4. **Factory-function lift for observer-state closures** — `createCanUseTool(ctx)` pattern.
5. **Orphan-import pruning after handler removal** — SonarLint S1128 + grep usage count.
6. **Honest partial completion over forced fit** — report partial with precise technical rationale.
