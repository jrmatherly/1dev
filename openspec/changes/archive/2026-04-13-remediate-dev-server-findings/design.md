## Context

The `add-dual-mode-llm-routing` commit `51318e1` shipped with a clean Entra→Anthropic decoupling, but parallel code review discovered Critical regressions in its migration semantics, and a same-day dev-server smoke surfaced three unrelated main-process polish issues. This change bundles both categories of follow-up because they share code surfaces (`chats.ts`, `claude.ts`, schema/migration, rule docs) and splitting them would require coordinating two PRs across the same files.

The original scope of this proposal was just the three dev-server findings. Code review of the proposal itself (separate from the dual-mode review) surfaced three Critical issues in the proposed design — a transitive-dep reliance, a non-existent default model id, and a phantom `codex-direct` kind that would fail to compile. All three are addressed in this revision, and the review's strongest architectural guidance (use feature flags instead of env vars; use DI for testability; collapse `ALLOW_UPSTREAM_CALLS` into the existing allowlist) drove material changes to the design.

Strategy reference: this change DOES NOT touch auth-strategy v2.1, the LiteLLM OSS boundary, or credential-store rules. It is a main-process-hygiene pass with surgical fixes to Entra-decoupling landed code.

## Goals / Non-Goals

**Goals:**
- Eliminate the migration-default regression so existing users' chats don't break on upgrade.
- Replace two `apollosai.dev` fetch call sites with provider-aware dispatch that works for LiteLLM, BYOK-direct, and Ollama users.
- Eliminate the raw-logger ENOENT race so every chat message lands in the debug log.
- Remove SignedFetch retry thrash from the dev-server log.
- Close review-surfaced gaps (BYOK token leak, stale rule doc, over-loose regression guard) before they compound.
- Keep the operator surface small: feature flags for runtime tuning (DB-backed), not env vars.

**Non-Goals:**
- Self-hosted `1code-api` endpoint for title/commit-msg generation. Provider-aware dispatch replaces the need; no restoration work required.
- Adding `codex-direct` to `ProviderMode`. Deferred to the Codex-integration workstream (tracked on roadmap).
- Full F6/F8 restoration — `ALLOW_UPSTREAM_CALLS` repositioning (now collapsed into the existing allowlist) is sufficient safety net until those F-entries are independently resolved.
- Runtime UX for operators to flip `auxAi*` flags without restarting the app. The feature-flags infrastructure supports this, but the Settings UI for it is out of scope.
- Spawning the Claude CLI binary for title-gen on `subscription-direct` mode. ~6.5s latency is prohibitive; Ollama fallback is acceptable.

## Decisions

### Decision 1: Singleton-promise pattern for `ensureLogsDir()`

Replace the current `let logsDir: string | null = null` + `if (!logsDir) { logsDir = ...; await mkdir(...) }` pattern with a single `Promise<string>` that all callers `await`. Concurrent first-burst writes share the pending promise; rejection nulls the promise so the next call retries.

```ts
let logsDirPromise: Promise<string> | null = null;

async function ensureLogsDir(): Promise<string> {
  if (!logsDirPromise) {
    logsDirPromise = (async () => {
      const dir = join(app.getPath("userData"), "logs", "claude");
      await mkdir(dir, { recursive: true });
      return dir;
    })().catch((err) => {
      logsDirPromise = null;
      throw err;
    });
  }
  return logsDirPromise;
}
```

**Rationale:** Idiomatic Node.js async-init, zero new deps, `mkdir({recursive:true})` is itself idempotent so incidental concurrent retries after rejection are safe. Spec pins the contract: "on rejection, the stored promise MUST be reset to null exactly once; concurrent retries after reset are safe but should be avoided."

**Alternatives considered:**
- `async-mutex` dep — rejected; one-call-site overhead.
- Synchronous `mkdirSync` — rejected; blocks the main thread on first call.
- Move mkdir to app-start — rejected; cleanup + retention logic belongs co-located with the logger module.

### Decision 2: Provider-aware auxiliary-AI dispatch with DI

New module `src/main/lib/aux-ai.ts` exposes both a factory and a bound convenience export:

```ts
export interface AuxAiDeps {
  createAnthropic: (cfg: AnthropicConfig) => Anthropic;
  generateOllamaName: (msg: string, model?: string) => Promise<string | null>;
  getProviderMode: () => ProviderMode | null;
  getFlag: <K extends FeatureFlagKey>(key: K) => FeatureFlagValue<K>;
}

export function makeGenerateChatTitle(deps: AuxAiDeps): (msg: string) => Promise<string>;
export function makeGenerateCommitMessage(deps: AuxAiDeps): (ctx: string) => Promise<string>;

// Already-bound convenience exports (for production call sites)
export const generateChatTitle: (msg: string) => Promise<string>;
export const generateCommitMessage: (ctx: string) => Promise<string>;
```

**Dispatch matrix** (driven by `getActiveProviderMode()`):

| ProviderMode kind | Backend | Credential | Notes |
|---|---|---|---|
| `subscription-litellm` | `@anthropic-ai/sdk` → LiteLLM `/v1/messages` | `authToken: mode.virtualKey` | `defaultHeaders: { "x-litellm-customer-id": mode.customerId }` for audit |
| `byok-litellm` | `@anthropic-ai/sdk` → LiteLLM `/v1/messages` | `authToken: mode.virtualKey` | Same customer-id header; model resolves from `mode.modelMap.haiku` |
| `byok-direct` | `@anthropic-ai/sdk` → `api.anthropic.com` | `apiKey: mode.apiKey` | Default model `claude-3-5-haiku-latest` |
| `subscription-direct` / no mode | Ollama fallback → truncated fallback | — | OAuth not usable with SDK |

**Model resolution precedence:** (1) `getFlag("auxAiModel")` when non-empty → (2) `mode.modelMap.haiku` when mode is `byok-litellm` or `subscription-litellm` (and modelMap is populated) → (3) `claude-3-5-haiku-latest`. This fixes review finding B-I2 (no env-var duplication) and B-C2 (pinned to a real model id).

**DI rationale (review B-I3):** bun:test has no built-in `jest.mock`. The factory pattern lets tests pass a `createAnthropic` stub that returns a fake `messages.create` implementation. Production code imports the bound `generateChatTitle` export; tests import `makeGenerateChatTitle` and inject fakes.

**Why `subscription-direct` falls through to Ollama:** The Claude Max OAuth token (`sk-ant-oat01-*`) is consumed only by the Claude CLI binary, not `@anthropic-ai/sdk`'s `messages.create()`. Spawning the 190 MB binary for a 50-token call has ~6.5s cold start — unacceptable for a polish feature. Ollama (if available) fills the gap. Same constraint applies to a hypothetical `codex-direct` once Codex provider modes are added.

### Decision 3: Feature flags, not env vars, for auxiliary-AI configuration

Add four entries to `FLAG_DEFAULTS` in `src/main/lib/feature-flags.ts`:

```ts
auxAiEnabled: true,             // boolean — master kill switch
auxAiModel: "",                 // string — model-id override (empty = use precedence)
auxAiTimeoutMs: 5000,           // number — per-call timeout
auxAiOrigin: "",                // string — reserved for operator-forced LiteLLM endpoint
```

Flags are DB-backed via `feature_flag_overrides`. Runtime-toggleable via the existing `setFlag()` API. Persists across restarts.

`max_tokens` (50 for title / 200 for commit-msg) and `temperature` (0.3 / 0.5) are NOT tunable — hardcoded in the helper module as implementation constants.

**Rationale (review B-I5 + user directive):** 11 env vars is excessive surface area. Feature flags align with `openspec/specs/feature-flags/spec.md`, support runtime changes without dev-server restart, and already have encrypted persistence. Operators who need per-feature tuning (rare) can add DB overrides; the defaults are "just works".

**Alternatives considered:**
- Keep original 11 env vars — rejected per review.
- 3 shared vars (`AUX_GEN_MODEL`, `AUX_GEN_ENABLED`, `AUX_GEN_TIMEOUT_MS`) — rejected in favor of feature-flags infrastructure (more aligned, runtime-toggleable).
- Keep `auxAiTimeoutMs` as an env var (one knob) — rejected for consistency; all four go to feature flags.

### Decision 4: `ALLOW_UPSTREAM_CALLS` collapsed into existing SignedFetch allowlist

`src/main/windows/main.ts:502-505` already restricts `api:signed-fetch` to the origin of `MAIN_VITE_API_URL` (default `apollosai.dev`). Extend that check to be conditional:

- If `MAIN_VITE_API_URL` is unset OR its origin hostname is `apollosai.dev`, reject ALL upstream fetches with `{ error: "upstream_unreachable", reason: "disabled_by_env" }`.
- If `MAIN_VITE_API_URL` is set to a live origin (e.g., self-hosted `1code-api`), the existing allowlist behavior permits those fetches.

No new `ALLOW_UPSTREAM_CALLS` env var is introduced. Operators "revive upstream testing" by setting `MAIN_VITE_API_URL` to a working endpoint (the variable is pre-existing).

**Rationale (review B-I4):** A second hardcoded origin check (`apollosai.dev` or `localhost:3000`) becomes stale when `1code-api` lands and operators point `MAIN_VITE_API_URL` at their self-hosted endpoint. Collapsing into the existing allowlist keeps the security invariant in ONE place and requires zero migration when `1code-api` comes online.

**Alternatives considered:**
- Separate `ALLOW_UPSTREAM_CALLS` env var (original proposal) — rejected per review (stale-by-design).
- Block at DNS level (catch ENOTFOUND) — rejected (doesn't cover revived upstream).
- Feature flag — considered, but allowlist logic is main-process boot-time; startup order makes the DB-backed flag awkward.

### Decision 5: 60-second per-origin unreachability cache

Module-scoped `Map<string, { checkedAt: number }>` in `src/main/windows/main.ts`. When an allowed fetch fails with `ECONNREFUSED` or `ENOTFOUND`, cache the origin. Subsequent calls within 60s return the cached error.

**Rationale:** 60s is short enough for operators reviving a server mid-session to see changes on the next origin check. Long enough to eliminate the startup React-Query-burst noise (~7 errors in 2 seconds). In-memory-only — restarts discard (correct).

### Decision 6: NEW capability `observability-logging`

Create `openspec/specs/observability-logging/spec.md` (via the change's `specs/` tree). First requirement is raw-logger concurrent-write safety. Future requirements (rotation policy, log shipping to `1code-api`) accumulate here.

**Rationale:** Specs are cheap to add and expensive to merge later. Separates log plumbing from debug-UI features (`diagnostics`, `debug`). No existing capability fits the raw-logger concern.

### Decision 7: Hotfix `add-dual-mode-llm-routing` regressions inside this change

Three Critical + one Important from the dual-mode code review are addressed here:

- **Migration backfill (A-C1):** Hand-edit `drizzle/0010_flowery_blackheart.sql` INSERT to backfill `routing_mode='direct'` for legacy rows (they were working direct-to-Anthropic before). Change schema default from `'litellm'` to `'direct'` so NEW rows also default sensibly. Add a CHECK constraint via drizzle-kit so the hand-edit matches future regeneration output.
- **Hand-edit exception (A-C2):** Document in `.claude/rules/database.md` that `0010_flowery_blackheart.sql` is an allowed-with-review exception. Top-of-file comment in the SQL file names the exception.
- **BYOK token leak (A-I1):** `getClaudeCodeToken()` at `claude.ts:109-128` returns null immediately when `settings?.activeAccountId` is set and the account's `accountType='byok'`. Prevents stale subscription OAuth from reaching a BYOK spawn.
- **Rule-doc drift (A-I2):** Rewrite `.claude/rules/auth-env-vars.md` to reflect post-decoupling reality — `applyEnterpriseAuth()` MUST never write `ANTHROPIC_AUTH_TOKEN`.

**Rationale:** Splitting these into a separate PR doubles coordination cost on shared files (`claude.ts`, `drizzle/`, rule docs). Bundling them here keeps the Critical-regression fix path short.

### Decision 8: `applyEnterpriseAuth()` returns `Promise<void>`

Currently returns `Promise<Record<string, string>>` but mutates nothing. Change to `Promise<void>` and update the call site in `buildClaudeEnv()` to `await applyEnterpriseAuth(env)` without assigning.

**Rationale (review A-I4):** The current signature is a landmine — future contributor adds a mutation, expects the caller to use the return value, but the caller discards it. Tighten the type to remove the footgun.

### Decision 9: Regression guard expansion and hardening

Six guards total (4 from original proposal + 2 new from review):

1. `raw-logger-concurrent-writes.test.ts` — 20 parallel writes, mkdir-once assertion.
2. `aux-ai-provider-dispatch.test.ts` — DI-based dispatch matrix test (all 4 `ProviderMode` kinds + no-mode).
3. `no-apollosai-aux-ai-fetch.test.ts` — grep guard with positive control.
4. `signed-fetch-cache.test.ts` — 10 parallel calls, 1 real fetch.
5. `spawn-env-invariants.test.ts` — **replaced assertion:** per-kind expected-key-set matrix (not just `credentialVarCount ≤ 1`). Catches leaked Anthropic tokens in the `byok-litellm` slot (review A-I5).
6. `no-legacy-oauth-byok-leak.test.ts` — active BYOK account + populated legacy row fixture; asserts `getClaudeCodeToken()` returns null.

### Decision 10: Startup preflight warning

At app start, check every active account row in `anthropic_accounts`. If `routing_mode='litellm'` but `MAIN_VITE_LITELLM_BASE_URL` is unset, log a loud warning:

```
[startup-preflight] ACCOUNT MISCONFIGURED: account <id> (<displayName>)
  has routing_mode='litellm' but MAIN_VITE_LITELLM_BASE_URL is unset.
  Chat send will fail. Set MAIN_VITE_LITELLM_BASE_URL in .env or
  switch the account to direct mode via Settings → Models.
```

**Rationale (review A-C1 follow-up):** The migration backfill (Decision 7) covers legacy rows. Startup preflight catches the remaining case: operators who explicitly created a LiteLLM-routed account but forgot to set the proxy URL. Makes the failure mode visible at startup instead of at chat-send time.

## Risks / Trade-offs

- **Risk (M3, M5):** Bundling dev-server polish + dual-mode hotfixes in one change increases revert blast radius. **Mitigation:** each task group is independently revertable at the git level; rollback plan documents this.
- **Risk (B-I8):** Singleton-promise pattern has a theoretical window where a caller synchronously retries on rejection before the `null`-reset runs. **Mitigation:** `mkdir({recursive:true})` is idempotent; incidental 2-3 concurrent retries are safe. Spec text names this.
- **Risk:** F11/F12 "RESOLVED (3/4 modes)" status invites user confusion. **Mitigation:** explicit status-line qualifier differentiates from fully-resolved entries like F5.
- **Risk (A-I3):** Regression guard for Entra-in-AUTH_TOKEN only scans `applyEnterpriseAuth()`. **Mitigation:** Decision 9 adds a broader project-wide scan in `no-legacy-oauth-byok-leak.test.ts` that catches `getValidToken()` → `ANTHROPIC_*_TOKEN` assignments anywhere in `src/main/`.
- **Risk:** Adding `@anthropic-ai/sdk` as explicit dep increases package tree size. **Mitigation:** SDK is already resolved (transitively); promoting to explicit dep adds zero bytes to the installed tree.
- **Trade-off:** Feature-flags-vs-env-vars defers operator-visible configuration to a future Settings UI (not built in this change). **Accepted:** default flag values work out-of-the-box; operators who need runtime tuning can use `setFlag()` via a tRPC call or one-line SQL UPDATE on `feature_flag_overrides`.
- **Trade-off:** Migration hand-edit stays a hand-edit. Documented as an exception. Future contributor must re-hand-edit if drizzle-kit regenerates. **Accepted:** CHECK constraint addition (Decision 7) narrows the regeneration divergence surface.

## Migration Plan

**Rollout sequence (single bundled PR):**
1. Package.json: add `@anthropic-ai/sdk` as explicit dep, update `bun.lock`.
2. Schema: change `routing_mode` default `'litellm'` → `'direct'`; regenerate migration; hand-edit the INSERT to match; add CHECK constraint; document hand-edit.
3. `raw-logger.ts`: singleton-promise pattern + regression guard.
4. `aux-ai.ts`: new module + DI factory + bound exports.
5. `chats.ts`: `generateSubChatName` + `generate-commit-message` delegate to `aux-ai.ts`.
6. `claude.ts`: `getClaudeCodeToken()` BYOK-null-return + startup preflight.
7. `env.ts`: `applyEnterpriseAuth()` return type to `Promise<void>`.
8. `windows/main.ts`: conditional allowlist + unreachability cache.
9. `feature-flags.ts`: 4 new `auxAi*` flags.
10. `.claude/rules/auth-env-vars.md` + `.claude/rules/database.md`: doc rewrites.
11. `docs/enterprise/upstream-features.md`: F11/F12 entries with qualified RESOLVED status.
12. Run all 5 CI gates + new regression guards locally.
13. Manual smoke per tasks.md §6.

**Rollback strategy:** `git revert HEAD` reverts the entire bundle. Schema: migration 0010 is additive; no down-migration required — column defaults don't roll back automatically but existing rows are unaffected. Feature flags: DB rows persist; if flags are removed from `FLAG_DEFAULTS`, `getFlag()` will type-error at compile time, pointing any stale caller.

**Zero-downtime:** Electron auto-update applies on next relaunch. No session interruption.

## Open Questions

- **Q:** When the self-hosted `1code-api` lands and operators set `MAIN_VITE_API_URL=https://api.1code.internal`, will the SignedFetch origin-conditional allowlist (Decision 4) correctly permit the new endpoint? **A:** Yes — the check is "is the resolved `MAIN_VITE_API_URL` origin unset or `apollosai.dev`". A self-hosted URL bypasses the rejection branch.
- **Q:** Should `auxAiModel` flag values be validated against a known Anthropic model list? **A:** No — model ids change faster than the app release cadence. Invalid values fall through the fallback chain naturally (SDK returns 404, helper catches, logs, falls through to Ollama/truncated). Validation would create false negatives on new models.
- **Q:** Do we need to store `customerId` in the `anthropicAccounts` row, or does resolving it via `authManager.getUser()?.id` on every call suffice? **A:** Resolve on every call — the ID is cached in MSAL's account cache, no additional round-trip. Storing it on the row creates a drift risk if the user's Entra identity changes mid-session.
