## Why

The `add-dual-mode-llm-routing` commit `51318e1` landed on `main` on 2026-04-13. A same-day dev-server smoke confirmed the Entra→Anthropic decoupling works end-to-end, but surfaced **two** classes of follow-up work:

1. **Three dev-server log findings** (paper cuts — non-blocking for chat but erode trust):
   - **Finding A** — raw-logger ENOENT race: concurrent calls to `logRawClaudeMessage` race the async `mkdir` in `ensureLogsDir()`; first ~7 messages per session are silently dropped. Directory is eventually created (file is 96 KB at rest).
   - **Finding B** — `generateSubChatName` + `generate-commit-message` call `apollosai.dev` unconditionally when online. DNS-fails in the fork. No provider-aware path.
   - **Finding C** — `[SignedFetch]` retries thrash against unreachable upstream URLs (~7 error lines per session).

2. **Critical regressions discovered by parallel code review** of `add-dual-mode-llm-routing` itself:
   - **Finding D** — migration default (`routing_mode='litellm'`) + unset `MAIN_VITE_LITELLM_BASE_URL` + NULL `virtual_key` → **every existing user's chat breaks on upgrade**. Same class of bug the change was meant to fix, for a different cohort.
   - **Finding E** — `drizzle/0010_flowery_blackheart.sql` was hand-edited, violating `.claude/rules/database.md` Rule 1. Next `db:generate` may regenerate divergent SQL.
   - **Finding F** — `getClaudeCodeToken()` legacy fallback can leak a subscription token into a BYOK spawn.
   - **Finding G** — `.claude/rules/auth-env-vars.md` still documents the OLD contract (pre-decoupling). A future agent reading it will re-introduce the bug.

Both classes are scoped cleanly to main-process polish and landed-code hotfix. Bundling them into one change keeps the dev-server log clean, closes the Critical regressions discovered by review, and leaves the Entra decoupling fix properly validated before Groups 8-10 of `add-dual-mode-llm-routing` proceed.

## What Changes

### A. Raw-logger concurrent-write fix

- Convert `ensureLogsDir()` in `src/main/lib/claude/raw-logger.ts` to a singleton-promise pattern (`logsDirPromise: Promise<string> | null`). The first call starts `mkdir`; concurrent callers share the pending promise. On rejection, the promise resets to null so a later call can retry. `mkdir({recursive: true})` is idempotent, so incidental concurrent retries are safe.

### B. Provider-aware auxiliary-AI dispatch (replaces `apollosai.dev` fetches)

- New module `src/main/lib/aux-ai.ts` exposing `generateChatTitle(userMessage)` and `generateCommitMessage(context)`. Both dispatch on the active `ProviderMode` resolved by `getActiveProviderMode()`:
  - `subscription-litellm` / `byok-litellm` → `@anthropic-ai/sdk` → LiteLLM `/v1/messages` using the virtual key as `authToken`, with `x-litellm-customer-id` attribution header set from `mode.customerId`.
  - `byok-direct` → `@anthropic-ai/sdk` → `api.anthropic.com` with the user's `sk-ant-api03-*` API key.
  - `subscription-direct` or no resolvable mode → existing Ollama fallback → truncated-fallback chain.
- **Model resolution precedence:** (1) explicit feature-flag override, (2) active account's `modelMap.haiku` when in any LiteLLM kind, (3) built-in default `claude-3-5-haiku-latest`. This eliminates duplicate configuration between the account row and an env var.
- **Module exports a DI-friendly factory** `makeGenerateChatTitle(deps: AuxAiDeps)` + an already-bound convenience export `generateChatTitle`. The factory accepts `createAnthropic`, `generateOllamaName`, `getProviderMode` as injectable dependencies, so bun:test can mock the SDK without `mock.module()` ambiguity.
- `@anthropic-ai/sdk` is promoted from transitive to **explicit `dependencies`** in `package.json`, pinned to `^0.81.0`, documented in `docs/conventions/pinned-deps.md`. Transitive reliance would break packaged builds if upstream `claude-agent-sdk` re-hoists or drops the package.

### C. Feature-flag-driven auxiliary-AI configuration (NOT env vars)

- Replace the originally-proposed `TITLE_GEN_*` + `COMMIT_MSG_*` env-var namespace with **four new entries in `FLAG_DEFAULTS`** (`src/main/lib/feature-flags.ts`):
  - `auxAiEnabled: true` — master kill switch for both features.
  - `auxAiModel: ""` — override for Anthropic-mode model id. Empty string means "resolve from `mode.modelMap.haiku` if available, else `claude-3-5-haiku-latest`".
  - `auxAiTimeoutMs: 5000` — per-call timeout.
  - `auxAiOrigin: ""` — reserved for future "send calls through a specific LiteLLM endpoint regardless of mode" operator tuning. Empty string means "use the active account's endpoint".
- `max_tokens` (50 for title / 200 for commit-msg) and `temperature` (0.3 / 0.5) are hardcoded implementation constants — not tunable at runtime. These are polish parameters nobody should need to change in production.
- Flags are DB-persisted via the existing `feature_flag_overrides` table, runtime-toggleable via the same mechanism as `enterpriseAuthEnabled`. Aligns with `openspec/specs/feature-flags/spec.md`.

### D. `ALLOW_UPSTREAM_CALLS` collapsed into the existing SignedFetch allowlist

- The `api:signed-fetch` IPC handler at `src/main/windows/main.ts:502-505` already restricts origins to `MAIN_VITE_API_URL` (default `apollosai.dev`). Rather than layering a second hardcoded origin check, the existing allowlist is extended to be conditional: when `MAIN_VITE_API_URL` is unset OR the allowed origin equals `apollosai.dev` (the dead upstream), ALL fetches are rejected with `{ error: "upstream_unreachable", reason: "disabled_by_env" }`.
- No new `ALLOW_UPSTREAM_CALLS` env var is introduced. Operators revive upstream testing by setting `MAIN_VITE_API_URL` explicitly (the variable already exists).
- When the self-hosted `1code-api` lands and operators set `MAIN_VITE_API_URL=https://api.1code.internal`, the guard correctly permits those fetches without requiring a separate flag flip.

### E. SignedFetch 60-second per-origin unreachability cache

- When a fetch is allowed through the origin check above AND fails with `ECONNREFUSED` or `ENOTFOUND`, cache the origin + timestamp for 60 seconds. Subsequent calls within the window return the cached error without attempting a new fetch. Eliminates the 7× error-log noise from the 2026-04-13 smoke. Log ONE warning line per origin per cache-refresh.

### F. Hotfix the `add-dual-mode-llm-routing` regressions surfaced by review

- **Migration fix (D-critical):** hand-edit `drizzle/0010_flowery_blackheart.sql` so the INSERT backfills `routing_mode='direct'` for legacy rows (they were working direct-to-Anthropic before this change). Change the Drizzle schema default in `src/main/lib/db/schema/index.ts` from `'litellm'` to `'direct'` so NEW rows also default sensibly. Add a CHECK constraint via drizzle-kit so the hand-edit can be regenerated properly.
- **Hand-edit exception (E-critical):** document the hand-edit in `.claude/rules/database.md` as an allowed-with-review exception and add a prominent comment at the top of `0010_flowery_blackheart.sql` so the next contributor does not regenerate blindly.
- **BYOK leak (F-important):** `getClaudeCodeToken()` in `src/main/lib/trpc/routers/claude.ts:109-128` returns null when the active account has `accountType='byok'`, instead of falling through to the legacy `claudeCodeCredentials` table.
- **Rule documentation (G-important):** rewrite `.claude/rules/auth-env-vars.md` to reflect the new invariant — `applyEnterpriseAuth()` MUST never write `ANTHROPIC_AUTH_TOKEN`; the Entra token flows to LiteLLM only as `x-litellm-customer-id`.
- **Startup preflight:** log a loud warning when any active account row has `routing_mode='litellm'` but `MAIN_VITE_LITELLM_BASE_URL` is unset. Surfaces the config gap at dev-server start rather than at chat-send time.

### G. Regression guards (expanded from 4 to 6)

- `raw-logger-concurrent-writes.test.ts` — 20 parallel writes, mkdir-called-once assertion.
- `aux-ai-provider-dispatch.test.ts` — exercises each `ProviderMode` kind using injected fakes (no `mock.module()`). Asserts per-kind env-var/header expectations + model-resolution precedence.
- `no-apollosai-aux-ai-fetch.test.ts` — greps `src/main/` for any `fetch.*apollosai\.dev` in aux-AI-adjacent code paths. Positive-control asserts the helper file exists first.
- `signed-fetch-cache.test.ts` — 10 parallel calls with ENOTFOUND mock, asserts only 1 real fetch.
- `spawn-env-invariants.test.ts` — **replaced assertion:** per-kind expected-key-set matrix (not just `credentialVarCount ≤ 1`). Catches leaked Anthropic tokens in the `byok-litellm` slot.
- `no-legacy-oauth-byok-leak.test.ts` — asserts `getClaudeCodeToken()` in `claude.ts` returns null when active account is BYOK. Fixture seeds a mock DB with both an active BYOK account AND a populated legacy `claudeCodeCredentials` row.

### H. F-entry catalog honesty

- F11 and F12 marked `✅ RESOLVED (3/4 provider modes) — subscription-direct degrades to Ollama-or-truncated-fallback (acceptable UX)`. Differentiates from fully-resolved entries like F5 (auto-update) that work for all users.

## Capabilities

### New Capabilities

- `observability-logging`: main-process debug logging for Claude CLI / Codex / Ollama subprocess interactions. First requirement is raw-logger concurrent-write safety; future logger requirements (rotation, shipping to `1code-api`) accumulate here.

### Modified Capabilities

- `renderer-data-access`: new requirement for SignedFetch origin-conditional allowlist + 60-second unreachability cache + provider-aware auxiliary-AI dispatch.
- `feature-flags`: four new flag entries (`auxAiEnabled`, `auxAiModel`, `auxAiTimeoutMs`, `auxAiOrigin`).
- `enterprise-auth`: clarifying addition — `applyEnterpriseAuth()` signature returns `Promise<void>` (not `Promise<Record<string,string>>`) to eliminate the "future contributor adds a mutation and expects the caller to use the return" landmine noted in review.
- `claude-code-auth-import`: clarifying addition — `getClaudeCodeToken()` behavior when active account is `accountType='byok'`.

## Impact

**Affected main-process modules:**
- `src/main/lib/claude/raw-logger.ts` — singleton promise pattern
- `src/main/lib/aux-ai.ts` — NEW module (DI-friendly factory)
- `src/main/lib/trpc/routers/chats.ts` — two call sites delegate to `aux-ai.ts`
- `src/main/windows/main.ts` — SignedFetch origin-conditional allowlist + unreachability cache
- `src/main/lib/trpc/routers/claude.ts` — `getClaudeCodeToken()` BYOK-null-return + startup preflight warning
- `src/main/lib/claude/env.ts` — `applyEnterpriseAuth()` return type tightened to `Promise<void>`
- `src/main/lib/feature-flags.ts` — four new flags
- `drizzle/0010_flowery_blackheart.sql` — hand-edit corrects legacy-row backfill
- `src/main/lib/db/schema/index.ts` — schema default `routing_mode='direct'`
- `package.json` + `bun.lock` — explicit `@anthropic-ai/sdk` dep

**Affected tRPC routers:** None added. `chats` + `claude` have body refactors.

**Affected database tables:** `anthropic_accounts` schema unchanged from `add-dual-mode-llm-routing`; this change only corrects the migration backfill semantics.

**Affected documentation:**
- `docs/enterprise/upstream-features.md` — F11/F12 entries, RESOLVED-with-qualifier status
- `docs/conventions/pinned-deps.md` — `@anthropic-ai/sdk` pin rationale
- `docs/conventions/feature-flags.md` — `auxAi*` flags
- `.claude/rules/database.md` — hand-edit exception
- `.claude/rules/auth-env-vars.md` — rewritten invariant
- `docs/operations/env-gotchas.md` — preflight warning behavior

**New env vars:** None. (Original proposal had 11; this revision uses feature flags exclusively.) `MAIN_VITE_API_URL` semantics are extended but the variable already exists.

**Phase 0 hard gates:** Does not advance any (all 15 complete). Closes three Phase 1 polish items + four Critical/Important hotfixes from `add-dual-mode-llm-routing` review.

**Out of scope:** Self-hosted `1code-api` implementation of title/commit-msg endpoints (no longer needed — provider-aware dispatch replaces the upstream dependency entirely). Full F6/F8 restoration (covered by their own F-entries). `codex-direct` provider mode (not in `ProviderMode` union; tracked on roadmap).

**Upstream-feature-inventory coverage:**
- F11 (Sub-Chat Name Generation) — ✅ RESOLVED (3/4 modes)
- F12 (Commit Message Generation) — ✅ RESOLVED (3/4 modes)

**Dependencies on other changes:**
- Builds on `add-dual-mode-llm-routing` (commit `51318e1`) — uses `ProviderMode`, `getActiveProviderMode()`, `deriveClaudeSpawnEnv()`.
- Does NOT depend on Groups 8-10 of that change (UI wizard, litellmModels router, docs). Can land in parallel.
