## 1. Prerequisite: promote `@anthropic-ai/sdk` to explicit dep

- [ ] 1.1 Add `@anthropic-ai/sdk: ^0.81.0` to `dependencies` in `package.json` (matches the transitive version currently resolved via `@anthropic-ai/claude-agent-sdk`).
- [ ] 1.2 Run `bun install` to update `bun.lock`. Verify the explicit dep appears at root-level `dependencies` and the transitive entry is still intact.
- [ ] 1.3 Add pin rationale to `docs/conventions/pinned-deps.md` — explain that promoting from transitive to explicit protects packaged builds from upstream re-hoisting.

## 2. Raw-logger concurrent-write fix

- [ ] 2.1 Replace `let logsDir: string | null` with `let logsDirPromise: Promise<string> | null` in `src/main/lib/claude/raw-logger.ts`. Update `ensureLogsDir()` to await the singleton promise. On rejection, reset the promise to null so the next call can retry.
- [ ] 2.2 Write `tests/regression/raw-logger-concurrent-writes.test.ts` — spy on `mkdir`, fire 20 parallel `logRawClaudeMessage` calls against a tmp userData directory, assert `mkdir` called exactly once and all 20 lines land in the file.
- [ ] 2.3 Verify `bun test tests/regression/raw-logger-concurrent-writes.test.ts` passes green.

## 3. Migration + schema hotfix (Critical: A-C1, A-C2)

- [ ] 3.1 In `src/main/lib/db/schema/index.ts`, change the `routingMode` column default from `"litellm"` to `"direct"`. Existing users were direct-to-Anthropic before `add-dual-mode-llm-routing`; defaulting to `direct` matches their working state.
- [ ] 3.2 Hand-edit `drizzle/0010_flowery_blackheart.sql`: the INSERT that copies legacy rows into `__new_anthropic_accounts` MUST populate `routing_mode='direct'` for all backfilled rows. Keep the table-level DEFAULT in sync (`'direct'` on the column).
- [ ] 3.3 Add a prominent top-of-file comment to `drizzle/0010_flowery_blackheart.sql` naming it as a hand-edited migration (documented exception), cross-referencing `.claude/rules/database.md`.
- [ ] 3.4 Update `.claude/rules/database.md` with an "Allowed exceptions" section documenting that `0010_flowery_blackheart.sql` was hand-edited to fix the backfill semantics that drizzle-kit's auto-generator could not express. Require peer review for any future hand-edit.
- [ ] 3.5 Regenerate `drizzle/meta/0010_snapshot.json` against the revised schema to keep snapshot + SQL in lockstep (use `bun run db:generate --dry` if available, or manually update to reflect the new default).
- [ ] 3.6 Test the migration on a pristine DB (fresh userData) AND against a dev DB with pre-migration rows (simulate by restoring the 0009 snapshot first). Verify: (a) pristine DB: all defaults populate correctly; (b) pre-existing rows: `routing_mode` backfilled to `'direct'`, not `'litellm'`.

## 4. Startup preflight warning (Important: complements A-C1)

- [ ] 4.1 In `src/main/index.ts` (or a new `src/main/lib/startup-preflight.ts` module imported there), after DB init runs a preflight check: for each active `anthropic_accounts` row, if `routing_mode='litellm'` AND `process.env.MAIN_VITE_LITELLM_BASE_URL` is unset, log a multi-line warning naming the account + suggesting fix paths.
- [ ] 4.2 The preflight MUST NOT block startup — it is advisory only. User can still start the app and see the warning in the console.
- [ ] 4.3 Add `docs/operations/env-gotchas.md` entry documenting the preflight warning format and remediation steps.

## 5. applyEnterpriseAuth return type tightening (A-I4)

- [ ] 5.1 In `src/main/lib/claude/env.ts`, change `applyEnterpriseAuth`'s return type from `Promise<Record<string, string>>` to `Promise<void>`. Remove the trailing `return env;` statement.
- [ ] 5.2 Update the call site in `buildClaudeEnv()` to `await applyEnterpriseAuth(env)` (no assignment from the void return).
- [ ] 5.3 Verify `bun run ts:check` — 0 errors preserved.

## 6. getClaudeCodeToken BYOK-null-return (Important: A-I1)

- [ ] 6.1 In `src/main/lib/trpc/routers/claude.ts` (`getClaudeCodeToken()` at ~line 91-128), after resolving the active account from `anthropic_accounts`, add an early-return: if `account.accountType === "byok"`, return `null` unconditionally (do NOT fall through to the legacy `claudeCodeCredentials` table).
- [ ] 6.2 Write `tests/regression/no-legacy-oauth-byok-leak.test.ts` with a fixture that seeds a mock DB with: (a) an active BYOK account row (`account_type='byok'`, `oauth_token=NULL`) AND (b) a populated legacy `claudeCodeCredentials` row. Assert `getClaudeCodeToken()` returns `null`.
- [ ] 6.3 Verify guard passes green.

## 7. Rule documentation rewrite (A-I2)

- [ ] 7.1 Rewrite `.claude/rules/auth-env-vars.md` to reflect post-decoupling reality:
  - `applyEnterpriseAuth()` MUST never write `ANTHROPIC_AUTH_TOKEN`
  - The Entra token acquired via `acquireTokenSilent()` is used only for MSAL-cache warming + early failure surface
  - Entra identity for LiteLLM audit flows through `x-litellm-customer-id` header (via `ANTHROPIC_CUSTOM_HEADERS` in `deriveClaudeSpawnEnv()` OR `defaultHeaders` in `aux-ai.ts`'s SDK init)
  - Keep the `STRIPPED_ENV_KEYS` rationale (still correct)
- [ ] 7.2 Cross-reference the revised `auth-env-vars.md` from `docs/enterprise/auth-strategy.md` §4.9.

## 8. Broader regression guard for Entra-to-AUTH_TOKEN (A-I3)

- [ ] 8.1 Expand `tests/regression/no-entra-in-anthropic-auth-token.test.ts` with a SECOND scan: walk all `.ts` files under `src/main/` and assert no pattern matches `authManager\.(getValidToken|getToken).*ANTHROPIC_.*_TOKEN` (with whitespace tolerance).
- [ ] 8.2 Preserve the existing `applyEnterpriseAuth` body extraction as the primary scan.
- [ ] 8.3 Verify guard passes green.

## 9. Per-kind expected-key-set matrix for spawn-env-invariants (A-I5)

- [ ] 9.1 Replace the loose `credentialVarCount <= 1` assertion in `tests/regression/spawn-env-invariants.test.ts` with a per-kind expected-key-set matrix. For each `ProviderMode` kind, assert the EXACT set of keys produced by `deriveClaudeSpawnEnv()` (not just the count).
- [ ] 9.2 For `byok-litellm`, verify that `ANTHROPIC_AUTH_TOKEN` is set to the virtual key (LiteLLM bearer), NOT an Anthropic token — use a regex that flags `sk-ant-` prefixes in the `ANTHROPIC_AUTH_TOKEN` value as a semantic-violation assertion.
- [ ] 9.3 Verify guard passes green (all existing 14 tests + new per-kind assertions).

## 10. Provider-aware auxiliary-AI module

- [ ] 10.1 Create `src/main/lib/aux-ai.ts` exporting:
  - `AuxAiDeps` interface (createAnthropic, generateOllamaName, getProviderMode, getFlag)
  - `makeGenerateChatTitle(deps: AuxAiDeps)` factory
  - `makeGenerateCommitMessage(deps: AuxAiDeps)` factory
  - Already-bound convenience exports `generateChatTitle`, `generateCommitMessage`
- [ ] 10.2 Implement the dispatch matrix in `makeGenerateChatTitle`:
  - Guard: `if (!deps.getFlag("auxAiEnabled")) return fallback`
  - Resolve `mode = deps.getProviderMode()`
  - Route: `subscription-litellm`/`byok-litellm` → `generateViaLiteLlm` ; `byok-direct` → `generateViaAnthropicDirect` ; else → Ollama → fallback
  - `generateViaLiteLlm(mode)`: `deps.createAnthropic({ baseURL: process.env.MAIN_VITE_LITELLM_BASE_URL, authToken: mode.virtualKey, defaultHeaders: mode.customerId ? { "x-litellm-customer-id": mode.customerId } : undefined })`
  - `generateViaAnthropicDirect(mode)`: `deps.createAnthropic({ apiKey: mode.apiKey })`
  - Model resolution: `deps.getFlag("auxAiModel")` nonempty → flag value; `mode.kind` is LiteLLM AND `mode.modelMap.haiku` → modelMap value; else `claude-3-5-haiku-latest`
  - Timeout: use `AbortController` with `setTimeout(..., deps.getFlag("auxAiTimeoutMs"))`
  - Hardcoded: `max_tokens: 50`, `temperature: 0.3`
- [ ] 10.3 Implement `makeGenerateCommitMessage` with the same dispatch but hardcoded `max_tokens: 200`, `temperature: 0.5`.
- [ ] 10.4 Export bound convenience versions `generateChatTitle` + `generateCommitMessage` that wire `deps` from production sources (real `@anthropic-ai/sdk`, `generateChatNameWithOllama` from `chats.ts`, `getActiveProviderMode` from `claude.ts`, `getFlag` from `feature-flags.ts`).

## 11. Refactor chats.ts to delegate to aux-ai.ts

- [ ] 11.1 In `src/main/lib/trpc/routers/chats.ts:1445` (`generateSubChatName`), remove the `apollosai.dev` fetch. Delegate to `generateChatTitle(input.userMessage)` from `aux-ai.ts`. Keep the tRPC procedure signature unchanged (still returns `{ name: string }`).
- [ ] 11.2 In `src/main/lib/trpc/routers/chats.ts:1340` (the `generate-commit-message` call site), delegate to `generateCommitMessage(context)` from `aux-ai.ts`.
- [ ] 11.3 Verify `bun run ts:check` — 0 errors.

## 12. Feature flags addition

- [ ] 12.1 Add four entries to `FLAG_DEFAULTS` in `src/main/lib/feature-flags.ts`:
  - `auxAiEnabled: true`
  - `auxAiModel: ""`
  - `auxAiTimeoutMs: 5000`
  - `auxAiOrigin: ""`
- [ ] 12.2 Add per-flag JSDoc blocks explaining each flag's purpose and the precedence chain.
- [ ] 12.3 Update `docs/conventions/feature-flags.md` with the new flags.
- [ ] 12.4 Verify type inference: `getFlag("auxAiEnabled")` → `boolean`, `getFlag("auxAiModel")` → `string`, etc.

## 13. Aux-AI regression guard

- [ ] 13.1 Write `tests/regression/aux-ai-provider-dispatch.test.ts` — construct `AuxAiDeps` fakes for each `ProviderMode` kind (4 concrete + null). For each:
  - Assert the correct SDK config (`baseURL`, `authToken`/`apiKey`, `defaultHeaders`)
  - Assert model resolution precedence (flag → modelMap → default)
  - Assert Ollama fallback kicks in for `subscription-direct` + null mode
  - Assert `auxAiEnabled=false` bypasses everything
- [ ] 13.2 Verify guard passes green.

## 14. No-upstream grep guard

- [ ] 14.1 Write `tests/regression/no-apollosai-aux-ai-fetch.test.ts` — scan `src/main/lib/trpc/routers/chats.ts` and `src/main/lib/aux-ai.ts`; assert zero matches for `fetch.*apollosai\.dev/api/agents`. Add a positive control: assert `aux-ai.ts` exists and contains expected imports.
- [ ] 14.2 Verify guard passes green.

## 15. SignedFetch origin-conditional allowlist + cache

- [ ] 15.1 In `src/main/windows/main.ts` near the `api:signed-fetch` IPC handler:
  - Read `MAIN_VITE_API_URL` once at handler entry
  - If unset OR hostname matches `apollosai.dev`: reject with `{ error: "upstream_unreachable", reason: "disabled_by_env" }`. Log once per origin per process lifetime.
- [ ] 15.2 Add module-scoped `unreachableCache: Map<string, { checkedAt: number }>` with 60s TTL. On allowed-fetch failure with `ECONNREFUSED` or `ENOTFOUND`, record the origin. On subsequent calls, return cached error.
- [ ] 15.3 Write `tests/regression/signed-fetch-cache.test.ts` — mock fetch to reject `ENOTFOUND`, fire 10 parallel calls, assert only 1 real fetch invocation.
- [ ] 15.4 Verify guard passes green.

## 16. F-entry catalog updates (with qualified-resolved status)

- [ ] 16.1 Add `### F11. Sub-Chat Name Generation ✅ RESOLVED (3/4 provider modes) 2026-04-13` section to `docs/enterprise/upstream-features.md` after F10. Body: historical dependency on `apollosai.dev/api/agents/sub-chat/generate-name`; current implementation in `src/main/lib/aux-ai.ts`; qualifier — `subscription-direct` users get Ollama-or-truncated-fallback.
- [ ] 16.2 Add `### F12. Commit Message Generation ✅ RESOLVED (3/4 provider modes) 2026-04-13` section analogously.
- [ ] 16.3 Run `/docs-drift-check` (manually-invoked skill) to catch any other doc surface mentioning these two call sites.

## 17. Quality gates

- [ ] 17.1 `bun run ts:check` — baseline 0 errors preserved.
- [ ] 17.2 `bun run build` — no new warnings.
- [ ] 17.3 `bun test tests/regression/` — all guards pass, including the 6 guards (4 updated + 2 new from this change's Groups 2, 6, 13, 14, 15).
- [ ] 17.4 `bun run lint` (local advisory) — no new lint hotspots.
- [ ] 17.5 `cd docs && bun run build` — xyd-js docs site builds cleanly.
- [ ] 17.6 `bun audit` — no NEW advisories.

## 18. Manual smoke

- [ ] 18.1 **Pristine DB smoke** — delete `~/Library/Application Support/Agents Dev/data/agents.db`, `bun run dev`. Verify migration runs cleanly with new `routing_mode='direct'` default.
- [ ] 18.2 **Legacy-migration smoke** — restore a dev DB from before `0010_flowery_blackheart.sql`, `bun run dev`. Verify: existing rows backfilled to `routing_mode='direct'`; chat works immediately without `MAIN_VITE_LITELLM_BASE_URL` being set.
- [ ] 18.3 **Subscription-direct smoke** — sign in with Entra, import Claude Max OAuth, send a test chat. Verify: chat works. Verify: title is Ollama-generated (if running) or truncated fallback (if not). Verify: ZERO `apollosai.dev` errors. Verify: `logs/claude/<session>.jsonl` exists, no ENOENT errors.
- [ ] 18.4 **BYOK-direct smoke** — switch account to `byok-direct` with a test Anthropic API key. Send a chat. Verify: title is AI-generated. Verify: no call to `api.anthropic.com` appears in `[SignedFetch]` logs (SDK bypasses the IPC handler — verify via Electron net-log or proxy-debugger instead).
- [ ] 18.5 **LiteLLM smoke** — set up a test `MAIN_VITE_LITELLM_BASE_URL`, switch account to `byok-litellm` with a test virtual key, verify `x-litellm-customer-id` header is included in the outbound request (inspect via proxy tools).
- [ ] 18.6 **Flag-override smoke** — `setFlag("auxAiModel", "claude-sonnet-4-5")` via dev console, verify the SDK call uses the overridden model.
- [ ] 18.7 **Kill-switch smoke** — `setFlag("auxAiEnabled", false)`, verify title is always truncated fallback regardless of provider mode.
- [ ] 18.8 **Startup preflight smoke** — manually seed an `anthropic_accounts` row with `routing_mode='litellm'` but don't set `MAIN_VITE_LITELLM_BASE_URL`. Restart. Verify the warning logs at startup.
- [ ] 18.9 **SignedFetch smoke** — load sidebar + help popover + settings. Verify at most ONE `[SignedFetch] upstream disabled` line per origin per session.

## 19. Follow-up roadmap entries

- [ ] 19.1 Add `[P3 Ready] Settings UI for feature-flag runtime toggling` to `docs/operations/roadmap.md` — operator-visible UI for flipping `auxAi*` and other feature flags without DB writes. Effort: Medium.
- [ ] 19.2 Add `[P3 Deferred] Codex-direct / Codex-litellm provider modes in aux-ai dispatch` — when the Codex integration workstream formalizes ProviderMode kinds for Codex, extend the aux-ai dispatch matrix. Effort: Small (one new case per kind).
- [ ] 19.3 Add `[P3 Ready] Runtime drift detection for landed migrations` — subagent-driven check that `drizzle/0010_*.sql` matches a regenerated snapshot, alerting on silent divergence. Effort: Small.

## 20. Archive

- [ ] 20.1 After PR merges and manual smoke (Group 18) confirms all scenarios, run `openspec archive remediate-dev-server-findings`.
- [ ] 20.2 Verify specs promoted: `openspec/specs/observability-logging/spec.md` exists; `openspec/specs/renderer-data-access/spec.md`, `openspec/specs/feature-flags/spec.md`, `openspec/specs/enterprise-auth/spec.md`, `openspec/specs/claude-code-auth-import/spec.md` all have the new requirements merged.

## Minor cleanup (tracked — apply during implementation, no separate sign-off needed)

The following items from the code review are minor and will be addressed opportunistically during the tasks above:

- **M1** `design.md` had two "Decision 3" sections — ALREADY FIXED in this revision (renumbered to Decisions 1-10).
- **M2** Spec requirements should not reference test file paths — ALREADY FIXED in `observability-logging` spec (test file moved to tasks.md §2.2).
- **M3** Default values phrased inconsistently — ALREADY FIXED in revised proposal.md.
- **M4** Task 6.2 originally claimed `[SignedFetch]` log entry for `api.anthropic.com` — FIXED in Task 18.4 (SDK bypasses IPC handler, verify via net-log instead).
- **M5** Rollback strategy claim weaker than stated — FIXED in design.md §Migration Plan.
- **M6** F11/F12 P-priority vs RESOLVED framing — FIXED (qualified-resolved status).
- **M7** `src/main/lib/config.ts` path — `isUpstreamAllowed()` helper dropped entirely (collapsed into existing allowlist per Decision 4).
- **M8** TS baseline protection guidance — Task 17.1 covers this; if a new error emerges, fix before proceeding.

Review findings explicitly captured as follow-up tasks above:
- **A-I1, A-I2, A-I3, A-I4, A-I5** — Tasks 6, 7, 8, 5, 9 respectively.
- **B-C1, B-C2, B-C3** — Tasks 1 (dep promotion), 10.2 (model precedence), absorbed into design (codex-direct deletion).
- **B-I1, B-I2, B-I3, B-I4, B-I5, B-I6, B-I7, B-I8** — Tasks 10.2 (customerId header), 10.2 (modelMap precedence), 10 (DI factory), 15 (allowlist collapse), 12 (feature flags), 16 (qualified RESOLVED), 10 (no extraction), 2.1 (spec text).
